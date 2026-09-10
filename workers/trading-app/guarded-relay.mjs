import { websocketDisposition } from '../../runtime/trading-ws-policy.mjs';
const bytes = value => typeof value === 'string' ? new TextEncoder().encode(value).byteLength : value.byteLength;

export function attachGuardedRelay(client, upstream, { now = () => Date.now() } = {}) {
  let count=0;let started=now();
  const close = (socket, code, reason) => { try { socket.close(code, reason); } catch {} };
  client.addEventListener('message', event => {
    if (typeof event.data !== 'string') { close(client,1003,'Text JSON only'); return; }
    if (bytes(event.data)>24576) { close(client,1009,'Message limit'); return; }
    if (now()-started>=60000) { started=now();count=0; }
    if (++count>60) { close(client,1008,'Rate limit'); return; }
    let message;
    try { message=JSON.parse(event.data); } catch { client.send(JSON.stringify({type:'request_rejected',error:'invalid_json'}));return; }
    const denied=websocketDisposition(message);
    if (denied) { client.send(JSON.stringify(denied));return; }
    try { upstream.send(event.data); } catch { close(client,1013,'Backend unavailable'); }
  });
  upstream.addEventListener('message', event => {
    if (bytes(event.data)>4*1024*1024) { close(client,1009,'Upstream message limit');return; }
    try { client.send(event.data); } catch { close(upstream,1013,'Client unavailable'); }
  });
  client.addEventListener('close',()=>close(upstream,1000,'Client closed'));
  upstream.addEventListener('close',()=>close(client,1012,'Backend reconnect'));
  client.addEventListener('error',()=>close(upstream,1011,'Client error'));
  upstream.addEventListener('error',()=>close(client,1013,'Backend unavailable'));
}

export function bridgeWebSocket(response) {
  if (!response.webSocket) throw new Error('Upstream did not provide a WebSocket');
  const pair=new WebSocketPair();const [browser, server]=Object.values(pair);
  server.accept();response.webSocket.accept();
  attachGuardedRelay(server,response.webSocket);
  return new Response(null,{status:101,webSocket:browser});
}
