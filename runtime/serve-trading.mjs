// Immutable release server: fixed private bind targets, public snapshot API and gated WS bridge.
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from './vendor/ws/wrapper.mjs';
import { snapshot, preflight, websocketDisposition } from './trading-api.mjs';

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.txt':'text/plain; charset=utf-8','.avif':'image/avif' };
export function createReleaseServer({ root, getSnapshot = snapshot, upstreamUrl = 'ws://127.0.0.1:8765' }) {
  const origins = new Set(['http://127.0.0.1:5173','http://100.123.21.56:5173','https://audiblchocolate.tail8754b4.ts.net:8443','http://audiblchocolate.tail8754b4.ts.net:8080']);
  const allowedOrigin = req => !req.headers.origin || origins.has(req.headers.origin) || req.headers.origin === `http://${req.headers.host}`;
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' });res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (!allowedOrigin(req)) return json(res,403,{error:'origin_refused'});
        if (url.pathname === '/api/trading/snapshot' && req.method === 'GET') return json(res,200,await getSnapshot());
        if (url.pathname === '/api/trading/preflight' && req.method === 'POST') {
          let body = ''; let exceeded = false;
          for await (const chunk of req) { if (Buffer.byteLength(body)+chunk.length>8192) { exceeded=true;break; } body+=chunk; }
          if (exceeded) return json(res,413,{error:'request_too_large',admitted:false});
          let draft;try { draft=JSON.parse(body); } catch { return json(res,400,{error:'invalid_json',admitted:false}); }
          return json(res,200,preflight(draft,await getSnapshot()));
        }
        return json(res,404,{error:'unsupported_or_live_route_disabled',admitted:false});
      }
      if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'method_not_allowed'});
      const requested = decodeURIComponent(url.pathname);
      if (requested.includes('\0') || requested.split('/').some(s=>s==='..' || s.startsWith('.'))) return json(res,404,{error:'not_found'});
      const target = path.resolve(root, '.'+(requested==='/'?'/index.html':requested));
      if (!target.startsWith(path.resolve(root)+path.sep)) return json(res,404,{error:'not_found'});
      let real;try { real=await realpath(target); } catch { return json(res,404,{error:'not_found'}); }
      if (!real.startsWith(path.resolve(root)+path.sep) || !(await stat(real)).isFile()) return json(res,404,{error:'not_found'});
      const mime=MIME[path.extname(real)];if(!mime)return json(res,404,{error:'not_found'});
      const bytes=await readFile(real);
      res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length,'Cache-Control':requested.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
      res.end(req.method==='HEAD'?undefined:bytes);
    } catch { if(!res.headersSent)json(res,500,{error:'surface_unavailable'});else res.end(); }
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:24576,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'||!allowedOrigin(req)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,client=>{
      const upstream=new WebSocket(upstreamUrl,{maxPayload:4*1024*1024,handshakeTimeout:8000,perMessageDeflate:false});
      let pending=[];let count=0;let windowAt=Date.now();
      client.on('message',(raw,binary)=>{
        if(binary){client.close(1003,'Text JSON only');return;}
        if(Date.now()-windowAt>=60000){count=0;windowAt=Date.now();}
        if(++count>60){client.close(1008,'Rate limit');return;}
        let msg;try{msg=JSON.parse(raw.toString());}catch{client.send(JSON.stringify({type:'request_rejected',error:'invalid_json'}));return;}
        const rejection=websocketDisposition(msg);
        if(rejection){client.send(JSON.stringify(rejection));return;}
        if(upstream.readyState===WebSocket.OPEN)upstream.send(raw.toString());
        else if(upstream.readyState===WebSocket.CONNECTING && pending.length<10)pending.push(raw.toString());
        else client.close(1013,'Backend unavailable');
      });
      upstream.on('open',()=>{for(const data of pending)upstream.send(data);pending=[];});
      upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN){if(client.bufferedAmount>4*1024*1024){client.close(1013,'Slow consumer');return;}client.send(data,{binary});}});
      upstream.on('error',()=>{if(client.readyState===WebSocket.OPEN)client.close(1013,'Backend unavailable');});
      upstream.on('close',()=>{if(client.readyState===WebSocket.OPEN)client.close(1012,'Backend reconnect');});
      client.on('error',()=>upstream.terminate());
      client.on('close',()=>{pending=[];upstream.terminate();});
    });
  });
  return {server,wss,close:async()=>{for(const client of wss.clients)client.terminate();await new Promise(resolve=>server.close(resolve));}};
}

if (process.argv[1] && await realpath(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);const value=key=>args[args.indexOf(key)+1];
  const host=args.includes('--host')?value('--host'):'127.0.0.1';
  const port=args.includes('--port')?Number(value('--port')):5173;
  if(!['127.0.0.1','100.123.21.56'].includes(host)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Private bind required');
  const release=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const {server,close}=createReleaseServer({root:path.join(release,'dist')});
  server.listen(port,host,()=>console.log(JSON.stringify({event:'ready',host,port,mode:'paper-only',root:path.join(release,'dist')})));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),8000).unref();});
}
