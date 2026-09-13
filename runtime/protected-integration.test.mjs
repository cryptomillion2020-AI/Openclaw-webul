import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import WebSocket, { WebSocketServer } from './vendor/ws/wrapper.mjs';
import { createAccessVerifier, accessAssertion } from './access-verifier.mjs';
import { createProtectedOrigin } from './serve-protected-trading.mjs';
import { createTradingEdge } from '../workers/trading-app/index.mjs';
import { attachGuardedRelay } from '../workers/trading-app/guarded-relay.mjs';
import { snapshot } from './trading-api.mjs';

const cfg={issuer:'https://unit.cloudflareaccess.com',audience:'a'.repeat(64),appOrigin:'https://app.sevinsolutions.com',originBase:'https://ws.sevinsolutions.com'};
const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='isolated-fixture-key';
const resolver=createLocalJWKSet({keys:[jwk]});const verify=createAccessVerifier(cfg,{keyResolver:resolver});
const now=Math.floor(Date.now()/1000);
const sign=(overrides={})=>new SignJWT({type:'app',...overrides}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(overrides.iss||cfg.issuer).setAudience(overrides.aud||cfg.audience).setSubject('isolated-test-user').setIssuedAt(overrides.iat??now-1).setExpirationTime(overrides.exp??now+300).sign(privateKey);
const valid=await sign();

test('Access signature, issuer, audience, expiration and token class are mandatory',async()=>{
 assert.equal(await verify(valid),true);
 for(const claims of [{iss:'https://other.cloudflareaccess.com'},{aud:'b'.repeat(64)},{exp:now-1},{iat:now+3600},{type:'match'},{type:'org'},{nbf:now+3600}])assert.equal(await verify(await sign(claims)),false);
 const pieces=valid.split('.');const body=JSON.parse(Buffer.from(pieces[1],'base64url'));body.email='tampered fixture';pieces[1]=Buffer.from(JSON.stringify(body)).toString('base64url');assert.equal(await verify(pieces.join('.')),false);
 assert.equal(await verify('eyJhbGciOiJub25lIn0.e30.'),false);assert.equal(await verify(null),false);assert.equal(await verify('x'.repeat(17000)),false);
});
test('Missing/malformed configuration and ambiguous assertion fields fail closed',()=>{
 for(const config of [{...cfg,audience:null},{...cfg,issuer:'http://unit.cloudflareaccess.com'},{...cfg,issuer:'https://user:password@unit.cloudflareaccess.com'},{...cfg,issuer:'https://unit.cloudflareaccess.com/path'}])assert.throws(()=>createAccessVerifier(config));
 assert.equal(accessAssertion({'cf-access-jwt-assertion':[valid,valid]}),null);assert.equal(accessAssertion(new Headers()),null);
});
test('Signing-key lookup failure never becomes an authorization bypass',async()=>{
 const unavailable=createAccessVerifier(cfg,{keyResolver:async()=>{throw Error('isolated lookup unavailable')}});assert.equal(await unavailable(valid),false);
});

test('Actual protected HTTP/WS server: authenticated snapshot, reconnect and zero mutation forwarding',{timeout:20000},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'trading-protected-test-'));await writeFile(path.join(root,'index.html'),'isolated fixture');
 const upstream=new WebSocketServer({host:'127.0.0.1',port:0});await once(upstream,'listening');let connections=0;const received=[];
 upstream.on('connection',ws=>{connections++;ws.on('message',raw=>{const value=JSON.parse(raw);received.push(value.type);ws.send(JSON.stringify({type:'full_state',fixture:true,market_context:null}));});});
 const app=createProtectedOrigin({root,accessConfig:cfg,verifier:verify,upstreamUrl:`ws://127.0.0.1:${upstream.address().port}`,getSnapshot:async()=>({...await snapshot({read:async()=>{throw Error('isolated no publisher')}}),fixture:true})});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base=`http://127.0.0.1:${app.server.address().port}`;const headers={'cf-access-jwt-assertion':valid,Origin:cfg.appOrigin};
 try{
  assert.equal((await fetch(base+'/api/trading/snapshot')).status,401);
  assert.equal((await fetch(base+'/api/trading/snapshot',{headers:{...headers,'cf-access-jwt-assertion':'invalid'}})).status,401);
  assert.equal((await fetch(base+'/api/trading/snapshot',{headers:{...headers,Origin:'https://foreign.invalid'}})).status,403);
  const result=await fetch(base+'/api/trading/snapshot',{headers});assert.equal(result.status,200);const state=await result.json();assert.equal(state.fixture,true);assert.equal(state.live_mode,false);assert.equal(state.journal.admission,false);assert.equal(state.policy.risk_per_trade,null);
  for(const endpoint of ['/api/trading/order','/api/trading/live','/api/orders','/api/credentials']){const r=await fetch(base+endpoint,{method:'POST',headers,body:'{}'});assert.equal(r.status,404);assert.equal((await r.json()).admitted,false);}
  const p=await fetch(base+'/api/trading/preflight',{method:'POST',headers,body:JSON.stringify({mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',quantity:1,architect_authorized:true})});assert.equal((await p.json()).admitted,false);
  for(let attempt=0;attempt<2;attempt++){
   const client=new WebSocket(base.replace('http:','ws:')+'/ws',{headers});await once(client,'open');
   for(const type of ['journal_transition','order','live_order','mode3_confirm']){const reply=once(client,'message');client.send(JSON.stringify({type}));const denied=JSON.parse((await reply)[0]);assert.equal(denied.ok,false);}
   const response=once(client,'message');client.send(JSON.stringify({type:'request_full_state'}));assert.equal(JSON.parse((await response)[0]).type,'full_state');const closed=once(client,'close');client.close();await closed;
  }
  assert.equal(connections,2);assert.deepEqual(received,['request_full_state','request_full_state']);
  const refused=await new Promise(resolve=>{const client=new WebSocket(base.replace('http:','ws:')+'/ws');client.on('unexpected-response',(_r,r)=>{resolve(r.statusCode);client.terminate()});client.on('error',()=>{});});assert.equal(refused,401);
 }finally{await app.close();for(const c of upstream.clients)c.terminate();await new Promise(r=>upstream.close(r));await rm(root,{recursive:true,force:true});}
});

const api=cfg.appOrigin+'/api/trading/snapshot';
test('Edge rejects absent/foreign auth, foreign Origin and alternative host before contacting origin',async()=>{
 let fetched=0;const edge=createTradingEdge({config:cfg,verify,fetchOrigin:async()=>{fetched++;return new Response('{}')}});
 for(const request of [new Request(api),new Request(api,{headers:{'cf-access-jwt-assertion':'invalid'}}),new Request(api,{headers:{'cf-access-jwt-assertion':valid,Origin:'https://foreign.invalid'}}),new Request('https://openclaw-webul.unit.workers.dev/api/trading/snapshot',{headers:{'cf-access-jwt-assertion':valid}})])assert.ok((await edge.fetch(request)).status>=400);
 assert.equal(fetched,0);
});
test('Edge streams only allowed routes to exact origin and strips unrelated credentials/cookies',async()=>{
 let captured;const edge=createTradingEdge({config:cfg,verify,fetchOrigin:async req=>{captured=req;return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Set-Cookie':'fixture=unused'}})}});
 const r=await edge.fetch(new Request(api,{headers:{'cf-access-jwt-assertion':valid,Origin:cfg.appOrigin,Authorization:'unrelated-fixture-value',Cookie:'unrelated=unused; CF_Authorization=isolated-cookie'}}));
 assert.equal(r.status,200);assert.equal(captured.url,cfg.originBase+'/api/trading/snapshot');assert.equal(captured.headers.get('Authorization'),null);assert.equal(captured.headers.get('Cookie'),'CF_Authorization=isolated-cookie');assert.equal(captured.headers.get('Origin'),cfg.appOrigin);assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('Edge denies trading mutation routes and preserves upstream 101 upgrade object',async()=>{
 const upgrade={status:101,webSocket:{fixture:true}};let fetched=0;const edge=createTradingEdge({config:cfg,verify,bridge:response=>response,fetchOrigin:async()=>{fetched++;return upgrade}});
 for(const pathname of ['/api/trading/order','/api/trading/live','/api/orders','/api/broker','/api/webhooks']){const r=await edge.fetch(new Request(cfg.appOrigin+pathname,{method:'POST',headers:{'cf-access-jwt-assertion':valid}}));assert.equal(r.status,404);assert.equal((await r.json()).admitted,false);}
 assert.equal(fetched,0);
 const r=await edge.fetch(new Request(cfg.appOrigin+'/ws',{headers:{'cf-access-jwt-assertion':valid,Upgrade:'websocket',Origin:cfg.appOrigin}}));assert.equal(r,upgrade);assert.equal(fetched,1);
});
test('Edge refuses oversized bodies and origin auth redirects; static UI still uses assets',async()=>{
 const edge=createTradingEdge({config:cfg,verify,fetchOrigin:async()=>new Response(null,{status:302,headers:{Location:'https://unit.cloudflareaccess.com/login'}})});
 const auth={'cf-access-jwt-assertion':valid};assert.equal((await edge.fetch(new Request(api,{headers:auth}))).status,502);
 assert.equal((await edge.fetch(new Request(cfg.appOrigin+'/api/trading/preflight',{method:'POST',headers:{...auth,'Content-Length':'9000'},body:'{}'}))).status,413);
 assert.equal((await edge.fetch(new Request(cfg.appOrigin+'/'),{ASSETS:{fetch:async()=>new Response('fixture UI')}})).status,200);
 assert.equal((await createTradingEdge({config:cfg,verify,staticAssets:false}).fetch(new Request(cfg.appOrigin+'/'))).status,404);
});

test('Edge independently filters journal/orders and enforces frame/rate bounds',()=>{
 class Socket extends EventTarget { sent=[];closed=[];send(x){this.sent.push(x)}close(code){this.closed.push(code)}message(data){this.dispatchEvent(new MessageEvent('message',{data}))} }
 const client=new Socket(),upstream=new Socket();attachGuardedRelay(client,upstream);
 for(const type of ['journal_transition','order','live_order','mode3_confirm'])client.message(JSON.stringify({type}));
 assert.equal(upstream.sent.length,0);assert.equal(client.sent.length,4);
 client.message(JSON.stringify({type:'request_full_state'}));assert.equal(upstream.sent.length,1);
 upstream.message(JSON.stringify({type:'full_state',fixture:true}));assert.equal(JSON.parse(client.sent.at(-1)).type,'full_state');
 client.message(new Uint8Array([1]).buffer);assert.ok(client.closed.includes(1003));
 client.message('x'.repeat(25000));assert.ok(client.closed.includes(1009));
 const limited=new Socket(),target=new Socket();attachGuardedRelay(limited,target);
 for(let i=0;i<61;i++)limited.message(JSON.stringify({type:'request_full_state'}));
 assert.equal(target.sent.length,60);assert.ok(limited.closed.includes(1008));
});
test('HTML masquerading as API data and unexpected queries are refused',async()=>{
 let count=0;const edge=createTradingEdge({config:cfg,verify,fetchOrigin:async()=>{count++;return new Response('<title>Login</title>',{headers:{'Content-Type':'text/html'}})}});
 const headers={'cf-access-jwt-assertion':valid};assert.equal((await edge.fetch(new Request(api,{headers}))).status,502);
 assert.equal((await edge.fetch(new Request(api+'?unexpected=1',{headers}))).status,400);assert.equal(count,1);
});
