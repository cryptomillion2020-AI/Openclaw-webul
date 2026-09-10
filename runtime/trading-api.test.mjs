import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import WebSocket,{WebSocketServer} from './vendor/ws/wrapper.mjs';
import {projectPerp,snapshot,preflight,websocketDisposition} from './trading-api.mjs';
import {createReleaseServer} from './serve-trading.mjs';
const now=Date.now();
const fixture={source:'blofin_public',instrument_class:'crypto_perp',map:'crypto_prices',generated_at:new Date(now-1000).toISOString(),freshness_ttl_seconds:300,data_quality:{all_fetches_ok:true,all_feeds_fresh:true,paper_only:true},crypto_prices:{'BTC-USDT':{instId:'BTC-USDT',last:'100',bidPrice:'99',askPrice:'101',markPrice:100,funding_rate:'0',ts:now-1000}}};
const state=()=>snapshot({now,read:async()=>Buffer.from(JSON.stringify(fixture))});
test('real-contract fixture projection retains zero funding, but never zero-substitutes missing',()=>{
 const p=projectPerp(fixture,now);assert.equal(p.state,'fresh');assert.equal(p.rows[0].funding_rate,0);
 const changed=structuredClone(fixture);delete changed.crypto_prices['BTC-USDT'].funding_rate;
 assert.equal(projectPerp(changed,now).rows[0].funding_rate,null);
});
test('freshness: stale, future, missing TTL, quality failure and stale row fail closed',()=>{
 assert.equal(projectPerp(fixture,now+301000).state,'stale');
 for(const change of [{generated_at:new Date(now+1000).toISOString()},{freshness_ttl_seconds:null},{data_quality:{all_feeds_fresh:true}},{crypto_prices:{'BTC-USDT':{...fixture.crypto_prices['BTC-USDT'],ts:now-400000}}}])assert.notEqual(projectPerp({...fixture,...change},now).state,'fresh');
});
test('wrong venue/class, malformed and empty feeds never masquerade as market data',()=>{
 assert.equal(projectPerp({...fixture,instrument_class:'crypto_spot'},now).state,'unavailable');
 assert.equal(projectPerp({...fixture,source:'fixture'},now).state,'unavailable');
 assert.equal(projectPerp(null,now).state,'unavailable');
 assert.equal(projectPerp({...fixture,crypto_prices:{}},now).state,'empty');
});
test('snapshot is always paper-only, policy UNSET, spot and accounts unavailable',async()=>{
 const s=await state();assert.equal(s.live_mode,false);assert.ok(Object.values(s.safety_layers).every(v=>v===false));
 assert.equal(s.spot.state,'unavailable');assert.equal(s.account.state,'unavailable');assert.equal(s.policy.max_leverage,null);assert.equal(s.policy.architect_authorized,false);
 assert.equal((await snapshot({read:async()=>{throw Error('missing')}})).perp.state,'unavailable');
});
test('fresh paper preflight needs confirmation, not a risk policy; no action is admitted',async()=>{
 const s=await state(),draft={mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',quantity:'1'};
 const result=preflight(draft,s);assert.equal(result.admitted,false);assert.equal(result.ok,true);assert.equal(result.confirmation_required,true);assert.deepEqual(result.reasons,[]);
 for(const extra of [{mode:'live'},{architect_authorized:true},{max_leverage:10},{source:'TradingView'},{instrument_class:'crypto_spot'},{quantity:null}])assert.equal(preflight({...draft,...extra},s).admitted,false);
});
test('WS rejects legacy journal and unknown/live-order routes before upstream forwarding',()=>{
 for(const type of ['journal_transition','order','live_order','paper_alert','observe_quote','mode3_confirm'])assert.ok(websocketDisposition({type}));
 assert.equal(websocketDisposition({type:'request_full_state'}),null);
});
test('actual isolated HTTP/WS: GET, preflight, no live route, traversal, relay and zero journal forwarding',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'webui-trading-test-'));await writeFile(path.join(root,'index.html'),'fixture document');
 const upstream=new WebSocketServer({host:'127.0.0.1',port:0});await once(upstream,'listening');
 const received=[];
 upstream.on('connection',socket=>socket.on('message',raw=>{const msg=JSON.parse(raw);received.push(msg.type);socket.send(JSON.stringify({type:'test_snapshot',fixture:true}));}));
 const app=createReleaseServer({root,getSnapshot:state,upstreamUrl:`ws://127.0.0.1:${upstream.address().port}`});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base=`http://127.0.0.1:${app.server.address().port}`;
 let ws;
 try{
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await fetch(base+'/api/trading/snapshot')).status,200);
  assert.equal((await fetch(base+'/api/trading/order',{method:'POST'})).status,404);
  assert.equal((await fetch(base+'/api/trading/snapshot',{headers:{Origin:'https://untrusted.invalid'}})).status,403);
  assert.equal((await fetch(base+'/.env.production')).status,404);
  assert.equal((await fetch(base+'/api/trading/preflight',{method:'POST',body:'{bad'})).status,400);
  const pre=await(await fetch(base+'/api/trading/preflight',{method:'POST',body:JSON.stringify({mode:'live',architect_authorized:true})})).json();assert.equal(pre.admitted,false);
  ws=new WebSocket(base.replace('http:','ws:')+'/ws');await once(ws,'open');
  let reply=once(ws,'message');ws.send(JSON.stringify({type:'journal_transition',event:'journal'}));assert.equal(JSON.parse((await reply)[0]).reject_reason,'paper_authorization_unavailable');
  reply=once(ws,'message');ws.send(JSON.stringify({type:'request_full_state'}));assert.equal(JSON.parse((await reply)[0]).type,'test_snapshot');
  assert.deepEqual(received,['request_full_state']);
 }finally{ws?.terminate();await app.close();for(const c of upstream.clients)c.terminate();await new Promise(r=>upstream.close(r));await rm(root,{recursive:true,force:true});}
});

test('CLI invoked through current symlink starts and serves, rather than exiting silently',{timeout:15000},async()=>{
 const {spawn}=await import('node:child_process');const {symlink,mkdir,cp}=await import('node:fs/promises');const net=await import('node:net');
 const tmp=await mkdtemp(path.join(os.tmpdir(),'webui-symlink-start-'));
 const repo=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
 // T-01: own a known release root; never serve an untracked or unrelated repo/dist.
 const release=path.join(tmp,'release');await mkdir(path.join(release,'dist'),{recursive:true});
 const document='<!doctype html><title>isolated CLI dist</title><p>exact test-owned payload</p>';
 await writeFile(path.join(release,'dist/index.html'),document);
 await cp(path.join(repo,'runtime'),path.join(release,'runtime'),{recursive:true});
 await symlink(release,path.join(tmp,'current'));
 const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,[path.join(tmp,'current/runtime/serve-trading.mjs'),'--host','127.0.0.1','--port',String(port)],{cwd:tmp,stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',()=>resolve());child.once('exit',code=>reject(Error('early_exit:'+code)));child.once('error',reject);});
  const response=await fetch(`http://127.0.0.1:${port}/`);assert.equal(response.status,200);
  assert.equal(await response.text(),document);
 }finally{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});await rm(tmp,{recursive:true,force:true});}
});
