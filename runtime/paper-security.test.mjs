import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {createAccessPrincipalVerifier} from './access-verifier.mjs';
import {createPaperApprovalConsumer,responseHash} from './paper-approval.mjs';
import {fingerprint} from './paper-ledger.mjs';
import {snapshot} from './trading-api.mjs';
import {createTradingEdge} from '../workers/trading-app/index.mjs';
const cfg={issuer:'https://unit.cloudflareaccess.com',audience:'a'.repeat(64),appOrigin:'https://app.sevinsolutions.com',originBase:'https://ws.sevinsolutions.com'};
const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='TEST-ONLY';
const getPrincipal=createAccessPrincipalVerifier(cfg,{keyResolver:createLocalJWKSet({keys:[jwk]})});
const mint=async sub=>new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(cfg.issuer).setAudience(cfg.audience).setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(privateKey);
const policy={kind:'fixture',version:'TEST-ONLY',max_leverage:2,risk_per_trade:500,max_funding_cost_fraction:0.01,holding_horizon_intervals:2,max_notional:500,fee_fraction:0.001,slippage_fraction:0.001};
const draft={mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',type:'market',quantity:1,price:null,leverage:1,risk_amount:500,policy_version:policy.version};
const owner={authenticated:true,subject:'fixture-owner'};
const input={principal:owner,draft,confirmation:'CONFIRM PAPER'};
const decide=async(request,principal,patch={})=>{const response={request_id:request.request_id,intent_id:request.intent_id,disposition:'APPROVED',reason:'TEST ONLY — ingénierie',decided_at:new Date().toISOString(),...patch};response.audit_hash=responseHash(response);return {principal,response};};
test('authenticated Access principal is verified, not decoded or taken from a client owner field',async()=>{
 const jwt=await mint('fixture-approver');assert.deepEqual(await getPrincipal(jwt),{authenticated:true,subject:'fixture-approver'});
 const parts=jwt.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'attacker'})).toString('base64url');assert.equal(await getPrincipal(parts.join('.')),false);assert.equal(await getPrincipal(null),false);
});
test('approval consumer accepts authenticated pinned approver and binds ticket/owner/policy/expiry',async()=>{
 const principal=await getPrincipal(await mint('fixture-approver'));
 const gate=createPaperApprovalConsumer({policy,allowedApprovers:['fixture-approver'],readVerifiedDecision:r=>decide(r,principal)});
 const approval=await gate.requestApproval(input),args={approval,owner:owner.subject,binding:fingerprint(draft),policy_version:policy.version,now:Date.now()};
 assert.equal(gate.verifyApproval(args),true);
 for(const change of [{owner:'another'},{binding:fingerprint({...draft,quantity:2})},{policy_version:'changed'},{now:Date.now()+120000}])assert.equal(gate.verifyApproval({...args,...change}),false);
});
test('contract-only checksum and login alone never grant approval; forged, unpinned, rejected, stale and altered decisions denied',async()=>{
 const valid=await getPrincipal(await mint('fixture-approver'));
 for(const principal of [false,{authenticated:false,subject:'fixture-approver'},await getPrincipal(await mint('someone-else'))]){
  const gate=createPaperApprovalConsumer({policy,allowedApprovers:['fixture-approver'],readVerifiedDecision:r=>decide(r,principal)});await assert.rejects(gate.requestApproval(input),/approval_authority_unverified/);
 }
 for(const patch of [{request_id:'APPROVAL-REQ-other'},{intent_id:'wrong'},{disposition:'REJECTED'},{decided_at:'2000-01-01T00:00:00Z'},{decided_at:'2100-01-01T00:00:00Z'}]){
  const gate=createPaperApprovalConsumer({policy,allowedApprovers:['fixture-approver'],readVerifiedDecision:r=>decide(r,valid,patch)});await assert.rejects(gate.requestApproval(input));
 }
 const forged=createPaperApprovalConsumer({policy,allowedApprovers:['fixture-approver'],readVerifiedDecision:async r=>{const d=await decide(r,valid);d.response.reason='changed after checksum';return d;}});await assert.rejects(forged.requestApproval(input),/approval_binding/);
 await assert.rejects(createPaperApprovalConsumer({policy}).requestApproval(input),/existing_approval_gate_unavailable/);
 await assert.rejects(createPaperApprovalConsumer().requestApproval(input),/risk_policy_unset/);
});
test('operational public snapshot refuses fixture-marked publisher',async()=>{
 const state=await snapshot({read:async()=>Buffer.from(JSON.stringify({fixture:true}))});assert.equal(state.perp.state,'unavailable');
});
test('CURRENT edge allows only named paper endpoints, strips forged ownership, preserves idempotency',async()=>{
 const seen=[];const edge=createTradingEdge({config:cfg,verify:async()=>true,fetchOrigin:async req=>{seen.push(req);return new Response('{}',{headers:{'Content-Type':'application/json'}});}});
 for(const [method,route] of [['GET','status'],['GET','ledger'],['POST','approval'],['POST','submit'],['POST','cancel'],['POST','reduce'],['POST','settle'],['POST','policy/validate']]){
  const r=await edge.fetch(new Request(cfg.appOrigin+'/api/trading/paper/'+route,{method,headers:{'cf-access-jwt-assertion':'TEST-ONLY','Idempotency-Key':'fixture-key','X-Owner':'forged','Origin':cfg.appOrigin}}));assert.equal(r.status,200);const req=seen.at(-1);assert.equal(req.headers.get('X-Owner'),null);assert.equal(req.headers.get('Idempotency-Key'),'fixture-key');
 }
 for(const route of ['live','fill','withdraw','broker'])assert.equal((await edge.fetch(new Request(cfg.appOrigin+'/api/trading/paper/'+route,{method:'POST',headers:{'cf-access-jwt-assertion':'TEST-ONLY'}}))).status,404);
});
