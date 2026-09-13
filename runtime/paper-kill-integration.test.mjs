// End-to-end: the emergency close-all state machine driving the REAL operational PaperSimulation
// ledger through createSimulationKillExecutor + the REAL server-owned approval gate. Proves the
// bridge cancels pending orders and reduces every open position to zero through the F-1-qualified
// engine (paper-simulation.mjs 48ae6f42) UNMODIFIED, and that stale market data yields an UNRESOLVED
// close (never an invented fill/flat) with the entry lock retained.
// Isolated temp SQLite fixtures only. No live orders, no user-ledger pollution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PaperSimulation } from './paper-simulation.mjs';
import { createPaperActionApprovals } from './paper-capability.mjs';
import { createSimulationKillExecutor } from './paper-kill-executor.mjs';
import { createPaperKillSwitch } from './paper-killswitch.mjs';

const PRINCIPAL = { authenticated: true, subject: 'owner-1' };
const freshFeed = (atMs) => ({ perp: { source: 'blofin_public', instrument_class: 'crypto_perp', state: 'fresh', generated_at: new Date(atMs).toISOString(), ttl_seconds: 30, rows: [
  { symbol: 'BTC-USDT', state: 'fresh', bid: '99', ask: '101', mark: '100', funding_rate: '0', observed_at_ms: atMs },
  { symbol: 'ETH-USDT', state: 'fresh', bid: '49', ask: '51', mark: '50', funding_rate: '0', observed_at_ms: atMs },
] } });

function harness(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kill-int-'));
  const gate = createPaperActionApprovals();
  const ledger = new PaperSimulation({ filename: path.join(dir, 'fixture-kill-int.sqlite'), verifyApproval: gate.verifyApproval });
  t.after(() => { ledger.close(); rmSync(dir, { recursive: true, force: true }); });
  let seq = 0;
  const call = async (action, input, state) => {
    const approval = await gate.requestApproval({ principal: PRINCIPAL, action, draft: input.draft, input, confirmation: 'CONFIRM PAPER' });
    return ledger.transaction(PRINCIPAL, 'seed-' + action + '-' + (++seq), action, { ...input, approval }, state);
  };
  return { dir, gate, ledger, call, killFile: path.join(dir, 'fixture-kill-latch.sqlite') };
}

test('real bridge: kill-all cancels pending + reduces every position to zero through the frozen engine', async (t) => {
  const h = harness(t);
  const now = Date.now();
  const state = freshFeed(now);
  // Two open positions: long BTC + short ETH.
  const btc = await h.call('submit', { draft: { mode: 'paper', instrument_class: 'crypto_perp', symbol: 'BTC-USDT', side: 'buy', type: 'market', quantity: '0.3', price: null } }, state);
  await h.call('settle', { id: btc.order.id }, state);
  const eth = await h.call('submit', { draft: { mode: 'paper', instrument_class: 'crypto_perp', symbol: 'ETH-USDT', side: 'sell', type: 'market', quantity: '2', price: null } }, state);
  await h.call('settle', { id: eth.order.id }, state);
  // One resting limit order that stays pending (a far-from-market buy).
  const limit = await h.call('submit', { draft: { mode: 'paper', instrument_class: 'crypto_perp', symbol: 'BTC-USDT', side: 'buy', type: 'limit', quantity: '0.1', price: '10' } }, state);

  const pre = h.ledger.view(PRINCIPAL);
  assert.equal(pre.positions.filter(p => p.status === 'open').length, 2);
  assert.equal(pre.orders.filter(o => ['pending', 'partial'].includes(o.status)).length, 1); // the limit order

  const exec = createSimulationKillExecutor({ ledger: h.ledger, requestApproval: h.gate.requestApproval, getSnapshot: async () => state });
  const kill = createPaperKillSwitch({ filename: h.killFile, executor: exec });
  t.after(() => kill.close());

  const r = await kill.activate({ owner: PRINCIPAL.subject });
  assert.equal(r.live_mode, false);
  assert.equal(r.state, 'kill_active');
  assert.equal(r.reconciled_flat, true);
  assert.equal(r.counts.cancelled, 1);
  assert.equal(r.counts.closed, 2);
  assert.equal(r.remaining.pending, 0);
  assert.equal(r.remaining.open, 0);

  // Verify through the REAL ledger view: flat + limit cancelled.
  const post = h.ledger.view(PRINCIPAL);
  assert.equal(post.positions.filter(p => p.status === 'open').length, 0);
  assert.equal(post.orders.find(o => o.id === limit.order.id).status, 'cancelled');
  // Entries locked; a new submit is refused by the entry-lock gate.
  assert.throws(() => kill.assertEntryAllowed(PRINCIPAL.subject), e => e.code === 'entries_locked_kill_active');

  // Resume lifts the lock without reopening anything.
  kill.resume({ owner: PRINCIPAL.subject });
  assert.equal(kill.assertEntryAllowed(PRINCIPAL.subject), true);
  assert.equal(h.ledger.view(PRINCIPAL).positions.filter(p => p.status === 'open').length, 0);
});

test('real bridge: STALE market data -> position UNRESOLVED (no invented fill), pending still cancelled, lock retained', async (t) => {
  const h = harness(t);
  const now = Date.now();
  const fresh = freshFeed(now);
  // Seed one open BTC position + one resting limit order while data is fresh.
  const btc = await h.call('submit', { draft: { mode: 'paper', instrument_class: 'crypto_perp', symbol: 'BTC-USDT', side: 'buy', type: 'market', quantity: '0.3', price: null } }, fresh);
  await h.call('settle', { id: btc.order.id }, fresh);
  await h.call('submit', { draft: { mode: 'paper', instrument_class: 'crypto_perp', symbol: 'BTC-USDT', side: 'buy', type: 'limit', quantity: '0.1', price: '10' } }, fresh);

  // Now activate with STALE data (generated far in the past -> engine quote() throws market_data_stale).
  const staleState = freshFeed(now - 10 * 60 * 1000);
  const exec = createSimulationKillExecutor({ ledger: h.ledger, requestApproval: h.gate.requestApproval, getSnapshot: async () => staleState });
  const kill = createPaperKillSwitch({ filename: h.killFile, executor: exec });
  t.after(() => kill.close());

  const r = await kill.activate({ owner: PRINCIPAL.subject });
  assert.equal(r.state, 'kill_active_unresolved');
  assert.equal(r.locked, true);
  assert.equal(r.reconciled_flat, false);
  assert.equal(r.counts.cancelled, 1);             // cancel needs no quote -> succeeds under stale data
  assert.equal(r.counts.close_unresolved, 1);       // position could not be closed defensibly
  assert.equal(r.remaining.open, 1);
  assert.equal(r.data_blocker, 'market_data_stale');
  // The position is UNTOUCHED in the real ledger — no invented fill.
  assert.equal(h.ledger.view(PRINCIPAL).positions.filter(p => p.status === 'open').length, 1);
  // Entry lock RETAINED.
  assert.throws(() => kill.assertEntryAllowed(PRINCIPAL.subject), e => e.code === 'entries_locked_kill_active');

  // When data resolves, a repeat activation converges to flat.
  const exec2 = createSimulationKillExecutor({ ledger: h.ledger, requestApproval: h.gate.requestApproval, getSnapshot: async () => freshFeed(Date.now()) });
  const kill2 = createPaperKillSwitch({ filename: h.killFile, executor: exec2 });
  t.after(() => kill2.close());
  const r2 = await kill2.activate({ owner: PRINCIPAL.subject });
  assert.equal(r2.state, 'kill_active');
  assert.equal(r2.reconciled_flat, true);
  assert.equal(h.ledger.view(PRINCIPAL).positions.filter(p => p.status === 'open').length, 0);
});
