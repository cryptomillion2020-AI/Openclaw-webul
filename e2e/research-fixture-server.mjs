// TEST ONLY: loopback fixture for the LIVE Research page (Lab.jsx).
// - Serves the built dist.
// - Wires the strategy-library over a TEMP curated corpus (allowed files + denied
//   _chunks / PRE-* / FAILED-QA + a symlink escaping the root) to prove curation + containment over HTTP.
// - Bridges /ws to a MOCK upstream that RECORDS every forwarded message to a log file.
//   This is a DRY-RUN transport recorder — no real backend, no real dispatch. Never a deploy entrypoint.
import { mkdtemp, mkdir, writeFile, symlink, appendFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket, { WebSocketServer } from '../runtime/vendor/ws/wrapper.mjs';
import { createReleaseServer } from '../runtime/serve-trading.mjs';
import { createStrategyLibrary } from '../runtime/strategy-library.mjs';

const DISPATCH_LOG = path.join(os.tmpdir(), 'research-dispatch-log.jsonl');
await writeFile(DISPATCH_LOG, ''); // truncate per run

// ---- temp curated corpus (basename matches the canonical dir for realistic client paths) ----
const base = await mkdtemp(path.join(os.tmpdir(), 'research-fixture-'));
const corpus = path.join(base, 'quant-crypto-pine-20260825');
await mkdir(path.join(corpus, '_chunks'), { recursive: true });
await mkdir(path.join(corpus, 'research'), { recursive: true });
await mkdir(path.join(corpus, 'verification'), { recursive: true });
await writeFile(path.join(corpus, 'QUANT-CRYPTO-STRATEGY.pine'), 'strategy("fixture", overlay=true)\n');
await writeFile(path.join(corpus, 'QUANT-CRYPTO-STRATEGY.PRE-FINAL-20260826.pine'), 'draft — must be withheld');
await writeFile(path.join(corpus, 'BRIEF.md'), '# Fixture brief\nWinning = evidence-backed, not guaranteed profit.');
await writeFile(path.join(corpus, '_chunks/WAVE1-CHUNK.md'), 'raw chunk — must be withheld');
await writeFile(path.join(corpus, 'research/ROOTS-RISK.md'), 'health/info research input');
await writeFile(path.join(corpus, 'research/ROOTS-RISK.FAILED-QA-bb9dbcda.md'), 'failed QA — must be withheld');
await writeFile(path.join(corpus, 'verification/ELEVIN-VERIFY.md'), 'independently verified');
const secret = path.join(base, 'secret.md');
await writeFile(secret, 'SECRET OUTSIDE ROOT');
await symlink(secret, path.join(corpus, 'escape.md')); // symlink escape target

const strategyLibrary = createStrategyLibrary({ roots: [corpus] });

// ---- mock upstream WS that records forwarded messages (dry-run transport) ----
const MOCK_PORT = 5199;
const mock = new WebSocketServer({ port: MOCK_PORT, host: '127.0.0.1' });
mock.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    appendFile(DISPATCH_LOG, JSON.stringify({ received_at: new Date().toISOString(), msg }) + '\n').catch(() => {});
  });
});

const principal = { authenticated: true, subject: 'isolated-research-fixture' };
const app = createReleaseServer({
  root: path.resolve('dist'),
  getSnapshot: async () => ({ schema_version: 'trading-webui-1', fixture: true, mode: 'paper-only', live_mode: false }),
  upstreamUrl: `ws://127.0.0.1:${MOCK_PORT}`,
  strategyLibrary,
  paper: { identity: async () => principal },
});
app.server.listen(5198, '127.0.0.1', () =>
  console.log(`ISOLATED RESEARCH FIXTURE http://127.0.0.1:5198  (dispatch log: ${DISPATCH_LOG})`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await app.close(); mock.close(); await rm(base, { recursive: true, force: true }); process.exit(0);
});
