// Isolated loopback test server. NEVER reads a publisher, credential or live backend.
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from '../runtime/vendor/ws/wrapper.mjs';
import { createReleaseServer } from '../runtime/serve-trading.mjs';
import { snapshot } from '../runtime/trading-api.mjs';
const upstream=new WebSocketServer({host:'127.0.0.1',port:0});await once(upstream,'listening');
upstream.on('connection',ws=>{const send=()=>ws.send(JSON.stringify({type:'full_state',fixture:true,mode3_conditions:null,market_context:null}));send();ws.on('message',send);});
const getSnapshot=async()=>({...await snapshot({read:async()=>{throw new Error('isolated: live state forbidden')}}),fixture:true});
const app=createReleaseServer({root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'),getSnapshot,upstreamUrl:`ws://127.0.0.1:${upstream.address().port}`});
app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
console.log(JSON.stringify({baseURL:`http://127.0.0.1:${app.server.address().port}`,fixture:true}));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,async()=>{await app.close();for(const ws of upstream.clients)ws.terminate();upstream.close(()=>process.exit(0));});
