// Immutable release server: fixed private bind targets, public snapshot API and gated WS bridge.
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from './vendor/ws/wrapper.mjs';
import { snapshot, preflight, websocketDisposition } from './trading-api.mjs';

import { createPaperHandler } from './paper-http.mjs';
import { createStrategyLibrary } from './strategy-library.mjs';
import { createBacktestStore, REQUIRED_METADATA_KEYS } from './backtest-ingest.mjs';
import { createPaperManagement } from './paper-management.mjs';
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.txt':'text/plain; charset=utf-8','.avif':'image/avif' };
export function createReleaseServer({ root, getSnapshot = snapshot, upstreamUrl = 'ws://127.0.0.1:8765', authorizeRequest = async () => true, extraOrigins = [], paper = {}, strategyLibrary = createStrategyLibrary(), backtestStore = createBacktestStore({ baseDir: path.join(path.dirname(path.resolve(root)), 'backtest-store') }), paperManagement = createPaperManagement({ filename: path.join(path.dirname(path.resolve(root)), 'paper-management.sqlite') }) }) {
  const paperHandler = createPaperHandler(paper);
  const BACKTEST_MAX_BYTES = 12 * 1024 * 1024;
  // Buffer a request body with a hard cap; refuses (413) before over-buffering an untrusted upload.
  const readBody = async (req, cap) => {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > cap) { const e = new Error('too_large'); e.status = 413; throw e; } chunks.push(chunk); }
    return Buffer.concat(chunks);
  };
  const origins = new Set(['http://127.0.0.1:5173','http://100.123.21.56:5173','https://audiblchocolate.tail8754b4.ts.net:8443','http://audiblchocolate.tail8754b4.ts.net:8080', ...extraOrigins]);
  const allowedOrigin = req => !req.headers.origin || origins.has(req.headers.origin) || req.headers.origin === `http://${req.headers.host}`;
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' });res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try {
      if (!await authorizeRequest(req)) return json(res,401,{error:'access_authentication_required',admitted:false});
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (!allowedOrigin(req)) return json(res,403,{error:'origin_refused'});
        const paperResponse=await paperHandler(req,url,getSnapshot);
        if(paperResponse)return json(res,paperResponse.status,paperResponse.body);
        // Item A — authenticated, read-only strategy library (fixed server-side allowlist).
        // Auth is enforced by authorizeRequest above; this surface holds no trading authority.
        if (url.pathname === '/api/research/strategy-library' && req.method === 'GET') {
          return json(res,200,await strategyLibrary.list());
        }
        if (url.pathname === '/api/research/strategy-library/file' && req.method === 'GET') {
          try {
            const f = await strategyLibrary.read(url.searchParams.get('path'));
            res.writeHead(200,{'Content-Type':f.mime,'Content-Length':f.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="${f.filename}"`});
            return res.end(req.method==='HEAD'?undefined:f.bytes);
          } catch (e) { return json(res, Number.isInteger(e?.status)?e.status:500, {error: e?.code || 'strategy_library_error'}); }
        }
        // PART A — versioned Pine panel (read-only). Includes labeled draft/superseded versions;
        // same fixed allowlist + realpath containment as the strategy library. No execution.
        if (url.pathname === '/api/research/pine-versions' && req.method === 'GET') {
          return json(res,200,await strategyLibrary.pineVersions());
        }
        if (url.pathname === '/api/research/pine-versions/file' && (req.method === 'GET' || req.method === 'HEAD')) {
          try {
            const f = await strategyLibrary.readPine(url.searchParams.get('path'));
            const dl = url.searchParams.get('download') === '1';
            res.writeHead(200,{'Content-Type':f.mime,'Content-Length':f.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Content-SHA256':f.sha256,'Content-Disposition':`${dl?'attachment':'inline'}; filename="${f.filename}"`});
            return res.end(req.method==='HEAD'?undefined:f.bytes);
          } catch (e) { return json(res, Number.isInteger(e?.status)?e.status:500, {error: e?.code || 'pine_read_error'}); }
        }
        // PART B — backtest-results ingest (authenticated, version-linked). Uploaded bytes are DATA
        // only: never executed, imported, or evaluated. Raw file body + metadata in query params
        // (no multipart parser needed). Immutable original + hash + parsed projection + provenance.
        if (url.pathname === '/api/research/backtest/upload' && req.method === 'POST') {
          let body; try { body = await readBody(req, BACKTEST_MAX_BYTES); } catch (e) { return json(res, e.status || 400, { error: e.status === 413 ? 'request_too_large' : 'read_error' }); }
          const q = url.searchParams;
          const metadata = {};
          for (const k of REQUIRED_METADATA_KEYS) if (q.get(k) != null) metadata[k] = q.get(k);
          try {
            const rec = await backtestStore.ingestUpload({
              strategyHash: q.get('strategy_hash'), strategyVersion: q.get('strategy_version'),
              filename: q.get('filename') || 'upload', content: body,
              contentType: req.headers['content-type'] || '', kind: q.get('kind') || 'auto', metadata,
            });
            return json(res, rec.idempotent ? 200 : 201, rec);
          } catch (e) { return json(res, Number.isInteger(e?.status) ? e.status : 500, { error: e?.code || 'ingest_error', detail: e?.detail || null }); }
        }
        if (url.pathname === '/api/research/backtest/manual' && req.method === 'POST') {
          let body; try { body = await readBody(req, 64 * 1024); } catch { return json(res, 413, { error: 'request_too_large' }); }
          let draft; try { draft = JSON.parse(body.toString('utf8')); } catch { return json(res, 400, { error: 'invalid_json' }); }
          try {
            const rec = await backtestStore.ingestManualSummary({
              strategyHash: draft.strategy_hash, strategyVersion: draft.strategy_version,
              summary: draft.summary, metadata: draft.metadata || {},
            });
            return json(res, rec.idempotent ? 200 : 201, rec);
          } catch (e) { return json(res, Number.isInteger(e?.status) ? e.status : 500, { error: e?.code || 'ingest_error', detail: e?.detail || null }); }
        }
        if (url.pathname === '/api/research/backtest/runs' && req.method === 'GET') {
          try { return json(res, 200, await backtestStore.listRuns({ strategyHash: url.searchParams.get('strategy_hash') || undefined })); }
          catch (e) { return json(res, 500, { error: e?.code || 'list_error' }); }
        }
        if (url.pathname === '/api/research/backtest/run' && req.method === 'GET') {
          try { return json(res, 200, await backtestStore.getRun(url.searchParams.get('id'))); }
          catch (e) { return json(res, Number.isInteger(e?.status) ? e.status : 500, { error: e?.code || 'run_error' }); }
        }
        // PART C — deterministic PAPER trade-protection engine (contract §3/§6). PAPER-ONLY: there
        // is no code path from these routes to a real order; any live/real field is refused (403).
        // The engine is deterministic CODE (not the LLM) and never autonomously opens/widens/resizes.
        // Enforcement (onObservation) is driven by the deterministic loop under authorization — not
        // exposed as an autonomous mutation route here; these routes are lifecycle + read only.
        if (url.pathname.startsWith('/api/research/paper-mgmt')) {
          const mgmtJson = async () => { const b = await readBody(req, 64 * 1024); try { return JSON.parse(b.toString('utf8') || '{}'); } catch { const e = new Error('invalid_json'); e.status = 400; throw e; } };
          try {
            if (url.pathname === '/api/research/paper-mgmt/brackets' && req.method === 'GET')
              return json(res, 200, paperManagement.list({ owner: url.searchParams.get('owner') || undefined }));
            if (url.pathname === '/api/research/paper-mgmt/bracket' && req.method === 'GET')
              return json(res, 200, paperManagement.get(url.searchParams.get('id')));
            if (url.pathname === '/api/research/paper-mgmt/audit' && req.method === 'GET')
              return json(res, 200, { events: paperManagement.auditTrail({ limit: Number(url.searchParams.get('limit')) || 200 }) });
            if (url.pathname === '/api/research/paper-mgmt/propose' && req.method === 'POST')
              return json(res, 201, paperManagement.propose(await mgmtJson()));
            if (url.pathname === '/api/research/paper-mgmt/confirm' && req.method === 'POST')
              return json(res, 200, paperManagement.confirm(await mgmtJson()));
            if (url.pathname === '/api/research/paper-mgmt/cancel' && req.method === 'POST')
              return json(res, 200, paperManagement.cancel(await mgmtJson()));
            // §1.5 reduce-only lifecycle: manual close of the position and bracket-qty clamp. Both are
            // user-initiated, PAPER-only, and never open/widen; no per-tick enforcement is exposed here.
            if (url.pathname === '/api/research/paper-mgmt/close' && req.method === 'POST')
              return json(res, 200, paperManagement.closePosition(await mgmtJson()));
            if (url.pathname === '/api/research/paper-mgmt/reduce' && req.method === 'POST')
              return json(res, 200, paperManagement.reduceQuantity(await mgmtJson()));
          } catch (e) { return json(res, Number.isInteger(e?.status) ? e.status : 500, { error: e?.code || e?.message || 'paper_mgmt_error', detail: e?.detail || null, live_mode: false }); }
          return json(res, 404, { error: 'unsupported_or_live_route_disabled' });
        }
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
  server.on('upgrade',async(req,socket,head)=>{
    try {
      if (!await authorizeRequest(req)) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
    } catch { socket.destroy(); return; }
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
