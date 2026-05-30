# WebSocket Proxy Worker

Proxies browser WSS connections to local WS server.

## Deploy

```bash
cd workers/ws-proxy

# Set your Cloudflare API token
export CLOUDFLARE_API_TOKEN=your_token_here

# Deploy the worker
npx wrangler deploy
```

The worker will be available at:
`https://openclaw-ws-proxy.<your-subdomain>.workers.dev/ws`

To route `app.sevinsolutions.com/ws` to this worker, add a route in the
Cloudflare Dashboard → Workers & Pages → openclaw-ws-proxy → Triggers → Routes:
`app.sevinsolutions.com/ws`

## How it works

```
Browser ──wss://app.sevinsolutions.com/ws──→ Cloudflare Worker
                                                 ↓
                                      ws://localhost:8765 (local server)
```

Browser trusts Cloudflare's cert → no mixed content warnings.
Cloudflare forwards to the local WebSocket server.
