# Trading source candidate — isolated review only

Base: existing cached `origin/main` commit `72d9ad96843ce8bac5684e89bdcc8efefe565cf4` from `cryptomillion2020-AI/Openclaw-webul`. No fetch, commit or deployment is part of preparing this candidate.

This is a scoped reconstruction, NOT a copy of the dirty working tree or the deployed release. Unchanged committed shell/source is inherited. Only necessary committed Workshop artwork/fonts are packaged for the test build. Other pages/assets and previous unpublished journal, research, freshness-library and shell changes are not newly incorporated. The Trading API independently tests read-time perpetual freshness and always refuses admission.

## Source dependencies

- TradingWorkspace, its CSS, API, HTTP/guarded WebSocket server and original tests: attributable to TRADING-WEBUI-FRONTEND-LIVE-20260909.
- TradingViewChart + tradingview-chart.css: isolated predecessor integration required by the Trading patch. Chart JSX includes the task's retry and honest-source disclosure changes. This React wrapper is project code, not a bundled TradingView service/library. The remote frame is display-only; offline tests substitute a declared frame fixture. No third-party service permission is asserted.
- useWebSocket: exact reconnect/lifecycle patch plus the predecessor's bounded same-origin/no-browser-token transport delta. No other hook changes.
- runtime/vendor/ws: required for the server guard and unit-test transport, version 8.21.3, source `https://github.com/websockets/ws`, MIT; LICENSE and original package metadata accompany all vendored files. No optional native modules installed. Upstream source identity is from the installed package metadata and original task's hash inventory, not a new network verification.
- Committed font assets retain `public/fonts/LICENSE-OFL.txt`.

## Tests without live state or network

Use an isolated test copy. Dependencies must already be available; no installer is part of this procedure. The verified local toolchain used Node v24.15.0, Vite 7.3.6 and the existing cached modules. Vite and react-router-dom do not match the base lockfile's versions; lockfile-install reproducibility remains unverified. Package manifests and lockfile are unchanged.

1. Build: `node node_modules/vite/bin/vite.js build --configLoader native`.
2. API/freshness/transport: `node --test runtime/trading-api.test.mjs`.
3. Start `node e2e/safe-preparation-server.mjs`; it binds an ephemeral loopback port and prints a non-secret `baseURL`. It injects unavailable state and a local mock WS upstream; it never reads the publisher or connects to the legacy server.
4. Set non-secret `WEBUI_TEST_BASE_URL` to that loopback URL and run `node node_modules/@playwright/test/cli.js test --config playwright.safe.config.cjs`.
5. Terminate only that fixture process. Generated dist/test output is not source and must not be committed.

All browser test files use the automatic offline fixture; remote HTTP is aborted or fulfilled locally, remote WebSockets are closed, service workers are blocked and external DNS resolution is disabled. The original test named `live public API...` is deliberately excluded because it requires a real publisher and the newer unpublished navigation shell. No assertion is weakened to make it count as passing.

No `.env`, host-private configuration, account/provider state, release directory, live current symlink, screenshots, logs, backups or dependency cache belongs in the commit. vite.config.js now requires explicit opt-in to an agent config path instead of automatically reading the host's private config.

## Boundaries

LIVE_MODE remains false; risk policy remains UNSET; orders and journal admission remain disabled. The server here is Node/filesystem-based: it is NOT a Cloudflare Worker deployment artifact. The existing protected Cloudflare target/API integration still requires confirmation and appropriate authentication. Browser frame and public-market tests here are isolated fixtures, not proof of public-domain functionality.

Rollback of preparation means deleting only the isolated candidate/test artifacts after authorization. Never reset or clean the live repository, change its index, restart services, or delete its existing release.
