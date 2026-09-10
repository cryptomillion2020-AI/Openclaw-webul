// TEST ONLY: loopback, temporary fixture ledger, synthetic data. Never a deployment entrypoint.
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {PaperSimulation} from '../runtime/paper-simulation.mjs';
import {createPaperActionApprovals} from '../runtime/paper-capability.mjs';
import {createReleaseServer} from '../runtime/serve-trading.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'paper-browser-fixture-'));
const gate=createPaperActionApprovals({namespace:'fixture'});
const ledger=new PaperSimulation({filename:path.join(dir,'fixture-browser.sqlite'),namespace:'fixture',verifyApproval:gate.verifyApproval});
const principal={authenticated:true,subject:'isolated-browser-fixture'};
const getSnapshot=async()=>({schema_version:'trading-webui-1',fixture:true,mode:'paper-only',live_mode:false,observed_at:new Date().toISOString(),policy:{max_leverage:null,architect_authorized:false},safety_layers:{configuration:false,execution:false,orderRouting:false,ui:false},perp:{source:'blofin_public',instrument_class:'crypto_perp',state:'fresh',generated_at:new Date().toISOString(),ttl_seconds:30,rows:[{symbol:'BTC-USDT',state:'fresh',last:100,mark:100,bid:99,ask:101,funding_rate:0.001,observed_at_ms:Date.now()}]},spot:{state:'unavailable',rows:[],reason:'unsupported_spot'},journal:{admission:false}});
const app=createReleaseServer({root:path.resolve('../revision-v2-evidence/dist'),getSnapshot,upstreamUrl:'ws://127.0.0.1:1',paper:{ledger,identity:async req=>req.headers['x-fixture-unauthenticated']?null:{...principal,subject:req.headers['x-fixture-owner']||principal.subject},requestApproval:gate.requestApproval}});
app.server.listen(5197,'127.0.0.1',()=>console.log('ISOLATED PAPER FIXTURE http://127.0.0.1:5197'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();ledger.close();await rm(dir,{recursive:true,force:true});process.exit(0);});
