# Protected Trading API and WebSocket integration

Task: `TRADING-DOMAIN-GITHUB-20260909-ACTUAL-API-WS`. Engineering owner: ELEVIN; PM: OVERSEER.

## Intended path

`app.sevinsolutions.com` (existing Cloudflare Access/WAF) → existing `openclaw-webul` Worker (or existing `openclaw-ws-proxy` route for `/ws`) → existing `ws.sevinsolutions.com` tunnel hostname → **dedicated loopback protected origin on 127.0.0.1:5181** → qualified filesystem-backed snapshot and guarded relay to the existing 127.0.0.1:8765 backend.

This is not a static-only API simulation. The origin uses `runtime/trading-api.mjs` and the actual public publisher file. No new broker, account, venue, private-state source or trading writer is added. The richer local/Tailnet release remains unchanged; the public frontend is the scoped candidate published in PR #2.

## Authentication and admission

- `jose` verifies RS256 signatures, exact issuer, exact application audience, expiration/not-before, required claims and application-token type at both the Worker and protected origin. No request assertions or user identities are cached or logged.
- `runtime/protected-access.json` contains **public identifiers, not credentials**. Its audience was obtained from the Cloudflare edge's signed public application metadata, using Cloudflare's official `GetAppInfo` method: signature/JWKS validation plus hostname, auth-domain, type and issued-at binding. No login or cookie extraction was used to obtain it.
- API/WS is refused on workers.dev/preview hostnames and on foreign browser Origins. Existing public static-asset exposure is not expanded into an API exposure.
- The proxy forwards only required transport headers and the Access authorization cookie, never arbitrary Authorization headers or unrelated cookies. Origin authentication redirects and HTML masquerading as API data are errors, not successful snapshots.
- `runtime/trading-ws-policy.mjs` is the existing pure allowlist/rejection function, shared without policy relaxation. **Both edge and Node origin filter messages**, so the edge is not a blind tunnel even during an origin fault.
- Signature-valid Access login grants permission to view the app, **not permission to trade**. Risk remains UNSET, `LIVE_MODE=false`, and journal/live-order/mode3-confirm mutations remain refused. Preflight always returns non-admission.

## Deployment boundaries

The Node origin is a distinct immutable release and user service. Do not overwrite mutable `dist`, replace the richer local `current` release, restart the Gateway or touch Tailscale.

The one ingress change is the existing `ws.sevinsolutions.com` rule's service from `ws://127.0.0.1:8765` to `http://127.0.0.1:5181`, after the protected origin is verified ready. This removes public access to the raw backend at that ingress. Preserve every other tunnel field, DNS record and Access/WAF policy. This requires the authorized root-owned host operation; do not change file permissions or bypass host policy to obtain it.

Worker configuration files:
- Root: `workers/trading-app/wrangler.jsonc`
- Existing WS Worker: `workers/ws-proxy/wrangler.protected.jsonc`

Use **versions upload + explicit version deployment** through the host-owned encrypted-credential consumer. This avoids editing existing routes, custom domains or workers.dev triggers through a general deploy command. Dry-run bundling does not authorize activation. Never use a fresh token request or plaintext credential setup as a workaround.

Activation is gated on: sealed source/build → verified protected origin → backed-up/validated ingress cutover → Worker version activation → authenticated domain API/WS/browser readback. No merge of `main` is part of this procedure.

## Tests

`node --test runtime/trading-api.test.mjs runtime/protected-integration.test.mjs`

These include valid/invalid issuer, audience, signature, expiration, future claims, token class and key-fetch failure; real isolated HTTP/WS requests and reconnect; zero journal/order forwarding; edge frame/rate bounds; foreign Origin/host refusal; invalid API content and redirects; and existing data-freshness/paper-admission controls. Test credentials and signing keys exist only inside isolated fixtures and are never valid against the production issuer/JWKS.

Frontend production build and the existing offline browser suite remain required. Both Worker bundles must pass Wrangler dry-run. Domain acceptance additionally requires a real, normal Access-authenticated browser session: snapshot JSON from the real publisher, WS 101 plus meaningful allowed message/reconnect, and forbidden mutation denial. A login page or redirect is not acceptance.

## Rollback

Before activation record both existing Worker deployment/version IDs, the complete root-owned ingress backup/hash, new origin release/hash and service prestate. Prefer a coordinated rollback that restores the previous Worker deployments and ingress without ever introducing an unguarded new route. Do not delete or reset the original repository or local release. A uploaded inactive Worker version is not a live deployment, and a staged root-host operation is not an executed operation.
