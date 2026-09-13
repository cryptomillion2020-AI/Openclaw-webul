// HTTP-surface test for the emergency PAPER kill switch wired through createProtectedOrigin:
// authenticated activate/status/resume, backend-ACK'd latch, entry-lock refusal of submit-during-kill,
// separate resume confirmation, and PAPER-ONLY live-field rejection. Isolated temp ledger + latch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const PRINCIPAL = { authenticated: true, subject: 'owner' };
const feed = (atMs) => ({ perp: { source: 'blofin_public', instrument_class: 'crypto_perp', state: 'fresh', generated_at: new Date(atMs).toISOString(), ttl_seconds: 60, rows: [
  { symbol: 'BTC-USDT', state: 'fresh', bid: '99', ask: '101', mark: '100', funding_rate: '0', observed_at_ms: atMs },
] } });

test('kill-switch HTTP: activate closes+locks, submit refused while locked, resume unlocks', async (t) => {
  const { createProtectedOrigin } = await import('./serve-protected-trading.mjs');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kill-http-'));
  writeFileSync(path.join(dir, 'index.html'), 'test');
  const app = createProtectedOrigin({
    root: dir, ledgerPath: path.join(dir, 'state', 'paper.sqlite'), verifier: async () => true,
    paper: { identity: async req => req.headers['x-unit-auth'] === 'yes' ? PRINCIPAL : null },
    getSnapshot: async () => feed(Date.now()),
  });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const auth = { 'Content-Type': 'application/json', 'x-unit-auth': 'yes' };
  const paper = (route, body, extra = {}) => fetch(base + '/api/trading/paper/' + route, { method: 'POST', headers: { ...auth, 'Idempotency-Key': 'unit-' + route + '-' + Math.random().toString(36).slice(2), ...extra }, body: JSON.stringify(body) });
  const kill = (route, method = 'POST', body) => fetch(base + '/api/trading/paper/kill/' + route, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });

  // Unauthenticated activation refused.
  assert.equal((await fetch(base + '/api/trading/paper/kill/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);

  // Seed: one open position + one resting limit order.
  const draft = { mode: 'paper', instrument_class: 'crypto_perp', symbol: 'BTC-USDT', side: 'buy', type: 'market', quantity: '1', price: null };
  const ap1 = await (await paper('approval', { draft, confirmation: 'CONFIRM PAPER' })).json();
  const order = (await (await paper('submit', { draft, approval: ap1.approval })).json()).order;
  const ap2 = await (await paper('approval', { action: 'settle', input: { id: order.id }, confirmation: 'CONFIRM PAPER' })).json();
  assert.equal((await paper('settle', { id: order.id, approval: ap2.approval })).status, 200);
  const limitDraft = { mode: 'paper', instrument_class: 'crypto_perp', symbol: 'BTC-USDT', side: 'buy', type: 'limit', quantity: '0.5', price: '10' };
  const ap3 = await (await paper('approval', { draft: limitDraft, confirmation: 'CONFIRM PAPER' })).json();
  assert.equal((await paper('submit', { draft: limitDraft, approval: ap3.approval })).status, 200);

  // Activate the emergency close-all.
  const actRes = await kill('activate', 'POST', {});
  assert.equal(actRes.status, 200);
  const act = await actRes.json();
  assert.equal(act.live_mode, false);
  assert.equal(act.state, 'kill_active');
  assert.equal(act.reconciled_flat, true);
  assert.equal(act.counts.cancelled, 1);
  assert.equal(act.counts.closed, 1);
  assert.equal(act.remaining.open, 0);
  assert.ok(typeof act.completion_ms === 'number');

  // Status reflects the backend latch.
  const st = await (await kill('status', 'GET')).json();
  assert.equal(st.state, 'kill_active');
  assert.equal(st.locked, true);

  // Ledger shows flat + cancelled.
  const ledger = await (await fetch(base + '/api/trading/paper/ledger', { headers: auth })).json();
  assert.equal(ledger.positions.filter(p => p.status === 'open').length, 0);

  // New entry refused while locked (409 entries_locked_kill_active).
  const ap4 = await (await paper('approval', { draft, confirmation: 'CONFIRM PAPER' })).json();
  const blocked = await paper('submit', { draft, approval: ap4.approval });
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, 'entries_locked_kill_active');

  // Resume WITHOUT confirmation refused.
  assert.equal((await kill('resume', 'POST', {})).status, 403);
  // Resume WITH the separate confirmation token unlocks.
  const resumed = await (await kill('resume', 'POST', { confirm: 'RESUME PAPER' })).json();
  assert.equal(resumed.state, 'inactive');
  assert.equal(resumed.reopened, false);
  assert.equal(resumed.auto_created, false);

  // Entries allowed again after resume.
  const ap5 = await (await paper('approval', { draft, confirmation: 'CONFIRM PAPER' })).json();
  assert.equal((await paper('submit', { draft, approval: ap5.approval })).status, 200);
});

test('kill-switch HTTP: live/real field on activate refused (PAPER-ONLY)', async (t) => {
  const { createProtectedOrigin } = await import('./serve-protected-trading.mjs');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kill-http-live-'));
  writeFileSync(path.join(dir, 'index.html'), 'test');
  const app = createProtectedOrigin({
    root: dir, ledgerPath: path.join(dir, 'state', 'paper.sqlite'), verifier: async () => true,
    paper: { identity: async req => req.headers['x-unit-auth'] === 'yes' ? PRINCIPAL : null },
    getSnapshot: async () => feed(Date.now()),
  });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const res = await fetch(base + '/api/trading/paper/kill/activate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-unit-auth': 'yes' }, body: JSON.stringify({ live: true }) });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'live_mode_denied');
});
