// Existing app domain only. Access is checked again before any origin request.
import accessConfig from '../../runtime/protected-access.json' with { type: 'json' };
import { createAccessVerifier, accessAssertion, ASSERTION_HEADER } from '../../runtime/access-verifier.mjs';
import { bridgeWebSocket } from './guarded-relay.mjs';

const denied = (status, error) => new Response(JSON.stringify({ error, admitted:false }), { status, headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'} });

export function createTradingEdge({ config = accessConfig, verify = createAccessVerifier(config), fetchOrigin = (...args) => fetch(...args), staticAssets = true, bridge = bridgeWebSocket } = {}) {
  if (config.appOrigin !== 'https://app.sevinsolutions.com' || config.originBase !== 'https://ws.sevinsolutions.com') throw new Error('Exact existing app and origin hosts required');
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      const transport = url.pathname === '/ws';
      const api = url.pathname.startsWith('/api/');
      if (url.pathname.startsWith('/ws/')) return denied(404, 'not_found');
      if (!transport && !api) return staticAssets && env.ASSETS ? env.ASSETS.fetch(request) : denied(404, 'not_found');
      // Do not expose new API/WS capabilities on the existing workers.dev/preview hosts.
      if (url.origin !== config.appOrigin) return denied(403, 'application_host_required');
      const origin = request.headers.get('Origin');
      if (origin && origin !== config.appOrigin) return denied(403, 'origin_refused');
      const assertion = accessAssertion(request.headers);
      if (!await verify(assertion)) return denied(401, 'access_authentication_required');
      if (api && url.search) return denied(400, 'query_not_supported');
      if (transport) {
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' || url.search) return denied(426, 'websocket_upgrade_required');
      } else if (!((url.pathname === '/api/trading/snapshot' && request.method === 'GET') || (url.pathname === '/api/trading/preflight' && request.method === 'POST'))) {
        return denied(404, 'unsupported_or_live_route_disabled');
      }
      if (Number(request.headers.get('Content-Length') || 0) > 8192) return denied(413, 'request_too_large');
      const target = new URL(url.pathname + url.search, config.originBase);
      const upstream = new Request(target, request);
      const keep = new Set(['origin','content-type','content-length','accept','upgrade','connection','sec-websocket-key','sec-websocket-version','sec-websocket-protocol','sec-websocket-extensions',ASSERTION_HEADER]);
      for (const name of [...upstream.headers.keys()]) if (!keep.has(name.toLowerCase())) upstream.headers.delete(name);
      // The existing origin may also have Access at its edge; forward only its Access cookie,
      // never arbitrary app cookies or Authorization headers. Nothing is logged or persisted.
      const authorizationCookie = (request.headers.get('Cookie') || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('CF_Authorization='));
      if (authorizationCookie) upstream.headers.set('Cookie', authorizationCookie);
      upstream.headers.set(ASSERTION_HEADER, assertion);
      try {
        const response = await fetchOrigin(upstream, { redirect:'manual' });
        if (response.status >= 300 && response.status < 400) return denied(502, 'origin_authentication_unavailable');
        if (response.status === 101) return transport ? bridge(response) : denied(502, 'unexpected_origin_protocol');
        if (api && response.status >= 200 && response.status < 300 && !response.headers.get('Content-Type')?.includes('application/json')) return denied(502, 'origin_api_response_invalid');
        const headers = new Headers(response.headers);headers.set('Cache-Control','no-store');headers.delete('Set-Cookie');
        return new Response(response.body, {status:response.status,statusText:response.statusText,headers});
      } catch { return denied(502, 'protected_origin_unavailable'); }
    },
  };
}

export default createTradingEdge();
