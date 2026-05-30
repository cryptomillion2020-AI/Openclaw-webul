/**
 * WebSocket Proxy Worker — app.sevinsolutions.com/ws
 *
 * Forwards browser WebSocket connections (wss://) to local server (ws://localhost:8765).
 * The browser trusts Cloudflare's cert, so no self-signed cert warnings.
 *
 * Deploy: cd workers/ws-proxy && npx wrangler deploy
 * Route:  app.sevinsolutions.com/ws
 */

// Target: local WebSocket server running on the VPS/backend
const UPSTREAM_WS = 'ws://localhost:8765';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only handle /ws path — pass everything else through
    if (url.pathname !== '/ws') {
      return new Response('Not Found', { status: 404 });
    }

    // Must be a WebSocket upgrade request
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Create two WebSocket connection pairs:
    //   clientWS  ←→  upstreamWS
    const [clientWS, proxyWS] = Object.values(new WebSocketPair());
    const upstreamURL = UPSTREAM_WS + url.search;

    try {
      const upstreamWS = new WebSocket(upstreamURL);

      // Accept upstream connection immediately
      await new Promise((resolve, reject) => {
        upstreamWS.addEventListener('open', resolve, { once: true });
        upstreamWS.addEventListener('error', reject, { once: true });
        // Timeout in case the upstream never opens
        const timer = setTimeout(() => reject(new Error('upstream timeout')), 5000);
        upstreamWS.addEventListener('open', () => clearTimeout(timer), { once: true });
      });

      // Bidirectional relay between client and upstream
      upstreamWS.addEventListener('message', (event) => {
        proxyWS.send(event.data);
      });

      proxyWS.addEventListener('message', (event) => {
        upstreamWS.send(event.data);
      });

      // Handle closures on either side
      upstreamWS.addEventListener('close', (event) => {
        proxyWS.close(event.code, event.reason);
      });

      proxyWS.addEventListener('close', (event) => {
        upstreamWS.close(event.code, event.reason);
      });

      // Handle errors
      upstreamWS.addEventListener('error', () => {
        proxyWS.close(1011, 'Upstream error');
      });

      proxyWS.addEventListener('error', () => {
        upstreamWS.close(1011, 'Proxy error');
      });

    } catch (err) {
      // Failed to connect upstream — close client with error
      proxyWS.close(1011, 'Failed to connect to upstream server');
      return new Response('Upstream connection failed', { status: 502 });
    }

    // Return the client-side WebSocket to the browser
    return new Response(null, { status: 101, webSocket: clientWS });
  },
};
