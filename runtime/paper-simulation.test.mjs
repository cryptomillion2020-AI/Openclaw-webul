import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {PaperSimulation} from './paper-simulation.mjs';import {createPaperActionApprovals} from './paper-capability.mjs';
test('no risk policy: confirmed lifecycle and exact accounting with owner isolation',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'paper-v2-'));let now=Date.now();const gate=createPaperActionApprovals({now:()=>now});
 const l=new PaperSimulation({filename:path.join(dir,'ledger.sqlite'),verifyApproval:gate.verifyApproval,now:()=>now});t.after(()=>{l.close();rmSync(dir,{recursive:true,force:true});});
 const principal={authenticated:true,subject:'test-owner'},other={authenticated:true,subject:'other'};let key=0;
 const state=()=>({perp:{source:'blofin_public',instrument_class:'crypto_perp',state:'fresh',generated_at:new Date(now).toISOString(),ttl_seconds:30,rows:[{symbol:'BTC-USDT',state:'fresh',bid:'0.1',ask:'0.2',mark:'0.15',funding_rate:'0.001',observed_at_ms:now}]}});
 const call=async(action,input)=>{const approval=await gate.requestApproval({principal,action,draft:input.draft,input,confirmation:'CONFIRM PAPER'});return l.transaction(principal,'request-key-'+(++key),action,{...input,approval},state());};
 const draft={mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',type:'market',quantity:'0.3',price:null};
 const a=await call('submit',{draft});assert.equal(l.policy,null);assert.equal(a.order.quantity,'0.3');
 const filled=await call('settle',{id:a.order.id});assert.equal(filled.position.cost_basis,'0.06');
 await call('reduce',{id:filled.position.id,quantity:'0.1'});await call('reduce',{id:filled.position.id,quantity:'0.2'});
 assert.equal(l.view(principal).realized_pnl,'-0.03');assert.equal(l.view(principal).positions[0].cost_basis,'0');assert.equal(l.view(other).positions.length,0);
 const b=await call('submit',{draft});await call('cancel',{id:b.order.id});assert.equal(l.view(principal).orders[1].status,'cancelled');
 assert.throws(()=>l.transaction(principal,'request-unauth','submit',{draft},state()),/per_trade_approval_required/);
 assert.throws(()=>l.transaction(null,'request-unauth','submit',{draft},state()),/authentication_required/);
 for(const action of ['live','broker','withdraw'])assert.throws(()=>l.transaction(principal,'request-live',action,{},state()),/unsupported_or_live/);
 const approval=await gate.requestApproval({principal,action:'submit',draft,confirmation:'CONFIRM PAPER'});const input={draft,approval};
 l.transaction(principal,'request-replay','submit',input,state());assert.equal(l.transaction(principal,'request-replay','submit',input,state()).duplicate,true);
 assert.throws(()=>l.transaction(principal,'request-consumed','submit',input,state()),/approval_already_used/);
 now+=60001;assert.throws(()=>l.transaction(principal,'request-expired','submit',input,state()),/per_trade_approval_required/);
});
test('legacy ledger is archived exactly and existing positions remain closable',async t=>{
 const {PaperLedger}=await import('./paper-ledger.mjs');const dir=mkdtempSync(path.join(os.tmpdir(),'paper-migrate-'));const filename=path.join(dir,'ledger.sqlite');
 const old=new PaperLedger({filename});const s=old.read();s.positions.push({id:'old-pos',owner:'owner',symbol:'BTC-USDT',side:'buy',quantity:0.3,entry_price:0.2,realized_pnl:-0.0001,status:'open'});s.history.push({id:'historical',action:'fill',original:0.1+0.2});old.db.prepare('UPDATE ledger SET data=? WHERE id=1').run(JSON.stringify(s));old.close();
 const gate=createPaperActionApprovals(),l=new PaperSimulation({filename,verifyApproval:gate.verifyApproval});t.after(()=>{l.close();rmSync(dir,{recursive:true,force:true});});
 assert.deepEqual(JSON.parse(l.db.prepare('SELECT data FROM ledger_v1_archive').get().data),s);assert.deepEqual(l.read().history,s.history);
 const principal={authenticated:true,subject:'owner'},input={id:'old-pos',quantity:'0.3'},approval=await gate.requestApproval({principal,action:'reduce',input,confirmation:'CONFIRM PAPER'}),now=Date.now();
 const state={perp:{source:'blofin_public',instrument_class:'crypto_perp',state:'fresh',generated_at:new Date(now).toISOString(),ttl_seconds:30,rows:[{symbol:'BTC-USDT',state:'fresh',bid:'0.1',ask:'0.2',mark:'0.15',funding_rate:'0',observed_at_ms:now}]}};
 assert.equal(l.transaction(principal,'legacy-close','reduce',{...input,approval},state).position.realized_pnl,'-0.0301');assert.equal(l.read().history[0].id,'historical');
});
test('V2 simultaneous processes: fill/cancel and double-close serialize',async t=>{
 const {spawn}=await import('node:child_process');const dir=mkdtempSync(path.join(os.tmpdir(),'paper-v2-race-'));const filename=path.join(dir,'fixture-race.sqlite');const principal={authenticated:true,subject:'race-owner'};
 const l=new PaperSimulation({filename,namespace:'fixture',verifyApproval:()=>true});t.after(()=>{l.close();rmSync(dir,{recursive:true,force:true});});const now=Date.now();const state={fixture:true,perp:{source:'blofin_public',instrument_class:'crypto_perp',state:'fresh',generated_at:new Date(now).toISOString(),ttl_seconds:60,rows:[{symbol:'BTC-USDT',state:'fresh',bid:'99',ask:'101',mark:'100',funding_rate:'0',observed_at_ms:now}]}};
 const submit=k=>l.transaction(principal,'submit-'+k,'submit',{draft:{mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',type:'market',quantity:'1',price:null},approval:'fixture-'+k},state).order;
 const worker=(action,input,key)=>new Promise((resolve,reject)=>{
 const source=`import {PaperSimulation} from ${JSON.stringify(new URL('./paper-simulation.mjs',import.meta.url).href)};const l=new PaperSimulation({filename:${JSON.stringify(filename)},namespace:'fixture',verifyApproval:()=>true});process.send('ready');process.once('message',()=>{try{l.transaction(${JSON.stringify(principal)},${JSON.stringify(key)},${JSON.stringify(action)},${JSON.stringify({...input,approval:'fixture-'+key})},${JSON.stringify(state)});console.log('committed')}catch(e){console.log('refused:'+e.message)}finally{l.close();process.disconnect()}})`;
 const p=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe','ipc']});let out='';p.stdout.on('data',d=>out+=d);p.on('error',reject);const done=new Promise((ok,no)=>p.on('exit',c=>c?no(Error('worker failure')):ok(out.trim())));p.on('message',()=>resolve({start:()=>p.send('go'),done}));});
 const race=async specs=>{const w=await Promise.all(specs.map(s=>worker(...s)));w.forEach(x=>x.start());return Promise.all(w.map(x=>x.done));};
 const a=submit('first');assert.equal((await race([['settle',{id:a.id},'fill-race-key'],['cancel',{id:a.id},'cancel-race-key']])).filter(x=>x==='committed').length,1);
 const b=submit('second');const filled=l.transaction(principal,'fill-second','settle',{id:b.id,approval:'fixture-second-fill'},state);assert.equal((await race([['reduce',{id:filled.position.id,quantity:'1'},'close-race-a'],['reduce',{id:filled.position.id,quantity:'1'},'close-race-b']])).filter(x=>x==='committed').length,1);
});
test('protected-origin wiring: persistent ledger, authenticated confirmed HTTP lifecycle',async t=>{
 const {createProtectedOrigin}=await import('./serve-protected-trading.mjs');const {once}=await import('node:events');const {writeFileSync,statSync}=await import('node:fs');
 const dir=mkdtempSync(path.join(os.tmpdir(),'paper-origin-v2-'));writeFileSync(path.join(dir,'index.html'),'test');const principal={authenticated:true,subject:'owner'},now=Date.now();
 const snapshot=async()=>({perp:{source:'blofin_public',instrument_class:'crypto_perp',state:'fresh',generated_at:new Date(now).toISOString(),ttl_seconds:60,rows:[{symbol:'BTC-USDT',state:'fresh',bid:'99',ask:'101',mark:'100',funding_rate:'0',observed_at_ms:now}]}});
 const app=createProtectedOrigin({root:dir,ledgerPath:path.join(dir,'state','paper.sqlite'),verifier:async()=>true,paper:{identity:async req=>req.headers['x-unit-auth']==='yes'?principal:null},getSnapshot:snapshot});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 const call=async(route,body,extra={})=>fetch(base+'/api/trading/paper/'+route,{method:'POST',headers:{'Content-Type':'application/json','x-unit-auth':'yes','Idempotency-Key':'unit-'+route,...extra},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/trading/paper/ledger')).status,401);
 assert.equal((statSync(path.join(dir,'state','paper.sqlite')).mode&0o777),0o600);
 const draft={mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',type:'market',quantity:'1',price:null};
 const approval=await(await call('approval',{draft,confirmation:'CONFIRM PAPER'})).json();assert.ok(approval.approval);
 const response=await call('submit',{draft,approval:approval.approval});assert.equal(response.status,200);const order=(await response.json()).order;
 const approved=await(await call('approval',{action:'settle',input:{id:order.id},confirmation:'CONFIRM PAPER'})).json();assert.equal((await call('settle',{id:order.id,approval:approved.approval})).status,200);
 assert.equal((await call('policy/validate',{kind:'fixture'})).status,422);
 assert.equal((await call('submit',{draft},{'Content-Type':'text/plain'})).status,415);
});
test('V2 negative contract: source/freshness, owner/action binding, precision, limits, fixture isolation',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'paper-v2-neg-')),principal={authenticated:true,subject:'owner'},other={authenticated:true,subject:'other'};let now=Date.now(),serial=0;const gate=createPaperActionApprovals({now:()=>now});const l=new PaperSimulation({filename:path.join(dir,'ledger.sqlite'),verifyApproval:gate.verifyApproval,now:()=>now});t.after(()=>{l.close();rmSync(dir,{recursive:true,force:true});});
 const state=()=>({perp:{source:'blofin_public',instrument_class:'crypto_perp',state:'fresh',generated_at:new Date(now).toISOString(),ttl_seconds:30,rows:[{symbol:'BTC-USDT',state:'fresh',bid:'99',ask:'101',mark:'100',funding_rate:'0',observed_at_ms:now}]}});
 const draft={mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',type:'market',quantity:'1',price:null};
 const approve=(action,input)=>gate.requestApproval({principal,action,draft:input.draft,input,confirmation:'CONFIRM PAPER'});
 const run=(action,input,s=state(),who=principal)=>l.transaction(who,'negative-key-'+(++serial),action,input,s);
 for(const patch of [{quantity:'0'},{quantity:'-1'},{quantity:'NaN'},{quantity:'Infinity'},{quantity:'0.000000001'},{quantity:'1000000000001'},{mode:'live'},{instrument_class:'crypto_spot'},{symbol:'UNSUPPORTED'},{architect_authorized:true}]){const d={...draft,...patch};assert.throws(()=>run('submit',{draft:d,approval:'invalid'}));const approval=await approve('submit',{draft:d});assert.throws(()=>run('submit',{draft:d,approval}));}
 for(const patch of [{source:'TradingView'},{instrument_class:'crypto_spot'},{state:'stale'},{generated_at:'invalid'},{generated_at:new Date(now-60000).toISOString()},{generated_at:new Date(now+1).toISOString()}]){const s=state();Object.assign(s.perp,patch);const approval=await approve('submit',{draft});assert.throws(()=>run('submit',{draft,approval},s));}
 for(const patch of [{bid:'102'},{ask:'NaN'},{funding_rate:null},{observed_at_ms:now-60000}]){const s=state();Object.assign(s.perp.rows[0],patch);assert.throws(()=>run('submit',{draft,approval:'invalid'},s));const approval=await approve('submit',{draft});assert.throws(()=>run('submit',{draft,approval},s));}
 const approval=await approve('submit',{draft});assert.throws(()=>run('submit',{draft,approval},{...state(),fixture:true}),/fixture_market/);assert.throws(()=>run('submit',{draft,approval},state(),other),/per_trade_approval/);assert.throws(()=>run('submit',{draft:{...draft,quantity:'2'},approval}),/per_trade_approval/);
 const o=run('submit',{draft,approval}).order;const settle=await approve('settle',{id:o.id});assert.throws(()=>run('cancel',{id:o.id,approval:settle}),/per_trade_approval/);
 const stale=state();stale.perp.rows[0].observed_at_ms-=60000;const before=JSON.stringify(l.read());assert.throws(()=>run('settle',{id:o.id,approval:settle},stale),/stale/);assert.equal(JSON.stringify(l.read()),before);
 const p=run('settle',{id:o.id,approval:settle}).position;
 const reduce=await approve('reduce',{id:p.id,quantity:'1'});assert.throws(()=>run('reduce',{id:p.id,quantity:'1',approval:reduce},stale),/stale/);run('reduce',{id:p.id,quantity:'1',approval:reduce});
 const limit={...draft,type:'limit',price:'95'},la=await approve('submit',{draft:limit});const order=run('submit',{draft:limit,approval:la}).order;assert.throws(()=>run('settle',{id:order.id,approval:'invalid'}));const sa=await approve('settle',{id:order.id});assert.throws(()=>run('settle',{id:order.id,approval:sa}),/limit_not_marketable/);
 const ca=await approve('cancel',{id:order.id});assert.equal(run('cancel',{id:order.id,approval:ca},stale).order.status,'cancelled');
 await assert.rejects(gate.requestApproval({principal,action:'submit',draft,confirmation:'yes'}),/explicit_trade_confirmation/);
});
