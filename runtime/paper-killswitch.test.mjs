// Test matrix — deterministic server-side EMERGENCY PAPER close-all state machine.
// Directive 20260912-190423 Work Item A. Covers, on ISOLATED temp SQLite fixtures only:
//   1. multi-position long/short kill-all -> flat + all pending cancelled
//   2. pending + partial fills cancelled (remaining paper orders wiped)
//   3. OCO / bracket race — protective bracket orders cancelled with their parent
//   4. duplicate request + restart — idempotency + persistent latch across a fresh handle
//   5. stale-price unresolved close — NEVER invents a fill/flat; entries stay LOCKED
//   6. invalid auth rejected (owner_required) + live-field rejected (live_mode_denied 403)
//   7. concurrent submit-during-kill rejected (assertEntryAllowed throws while locked)
//   8. audit trail preserved (append-only; totals/precision untouched by the switch)
// No live orders, no user-ledger pollution. The executor adapter models the PAPER sim/bracket layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPaperKillSwitch, KillSwitchError, KILL_STATES } from './paper-killswitch.mjs';

let tmp;
const store = () => { tmp = mkdtempSync(join(tmpdir(), 'paper-kill-')); return join(tmp, 'fixture-kill.sqlite'); };
function cleanup() { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = null; }

// In-memory PAPER executor modelling pending orders (incl. brackets) + open positions, ownership-scoped.
// staleSymbols throw on close (the never-invent-fill contract). cancel is always eligible.
function mockExecutor(seed = {}, { staleSymbols = new Set() } = {}) {
  const pending = new Map((seed.pending || []).map(o => [o.id, { ...o }]));
  const positions = new Map((seed.positions || []).map(p => [p.id, { ...p }]));
  const log = [];
  return {
    _pending: pending, _positions: positions, _log: log,
    listPending({ owner }) { return [...pending.values()].filter(o => o.owner === owner); },
    listOpenPositions({ owner }) { return [...positions.values()].filter(p => p.owner === owner); },
    cancelPending({ owner, id, kind }) {
      const o = pending.get(id);
      if (!o || o.owner !== owner) return; // already-terminal / not-owned: safe no-op
      pending.delete(id); log.push({ op: 'cancel', id, kind });
    },
    closePosition({ owner, id, symbol, quantity }) {
      const p = positions.get(id);
      if (!p || p.owner !== owner) return;
      if (staleSymbols.has(symbol)) { const e = new Error('market_data_stale'); e.code = 'market_data_stale'; throw e; }
      positions.delete(id); log.push({ op: 'close', id, symbol, quantity });
    },
  };
}

test('states enum is frozen and complete', async () => {
  assert.deepEqual(KILL_STATES, ['inactive', 'killing', 'kill_active', 'kill_active_unresolved', 'resuming']);
  assert.ok(Object.isFrozen(KILL_STATES));
});

test('1. multi-position long/short kill-all -> flat and all pending cancelled', async () => {
  const ex = mockExecutor({
    pending: [
      { id: 'o1', owner: 'user-1', symbol: 'BTC-USDT', kind: 'entry' },
      { id: 'o2', owner: 'user-1', symbol: 'ETH-USDT', kind: 'entry' },
    ],
    positions: [
      { id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' },   // long
      { id: 'p2', owner: 'user-1', symbol: 'ETH-USDT', quantity: '2.0' },   // short
    ],
  });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    const r = await k.activate({ owner: 'user-1' });
    assert.equal(r.live_mode, false);
    assert.equal(r.state, 'kill_active');
    assert.equal(r.locked, true);
    assert.equal(r.reconciled_flat, true);
    assert.equal(r.counts.pending_found, 2);
    assert.equal(r.counts.cancelled, 2);
    assert.equal(r.counts.positions_found, 2);
    assert.equal(r.counts.closed, 2);
    assert.equal(r.remaining.pending, 0);
    assert.equal(r.remaining.open, 0);
    assert.equal(ex._pending.size, 0);
    assert.equal(ex._positions.size, 0);
    assert.ok(r.completion_ms >= 0);
  } finally { k.close(); cleanup(); }
});

test('2. pending + partial-fill orders all cancelled', async () => {
  const ex = mockExecutor({
    pending: [
      { id: 'o1', owner: 'user-1', symbol: 'BTC-USDT', kind: 'entry' },
      { id: 'o2', owner: 'user-1', symbol: 'BTC-USDT', kind: 'partial' }, // partially filled remainder still pending
    ],
    positions: [{ id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.25' }], // partial fill produced a position
  });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    const r = await k.activate({ owner: 'user-1' });
    assert.equal(r.counts.cancelled, 2);
    assert.equal(r.counts.closed, 1);
    assert.equal(r.reconciled_flat, true);
  } finally { k.close(); cleanup(); }
});

test('3. OCO/bracket race — protective bracket orders cancelled with parent', async () => {
  const ex = mockExecutor({
    pending: [
      { id: 'o1', owner: 'user-1', symbol: 'BTC-USDT', kind: 'entry' },
      { id: 'b-stop', owner: 'user-1', symbol: 'BTC-USDT', kind: 'bracket_stop' },
      { id: 'b-tgt', owner: 'user-1', symbol: 'BTC-USDT', kind: 'bracket_target' },
    ],
    positions: [{ id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' }],
  });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    const r = await k.activate({ owner: 'user-1' });
    assert.equal(r.counts.pending_found, 3);
    assert.equal(r.counts.cancelled, 3); // parent + both bracket legs
    assert.equal(r.reconciled_flat, true);
    assert.equal(ex._pending.size, 0);
  } finally { k.close(); cleanup(); }
});

test('4a. duplicate/repeated activation is idempotent (safe, converges to flat)', async () => {
  const ex = mockExecutor({
    pending: [{ id: 'o1', owner: 'user-1', symbol: 'BTC-USDT', kind: 'entry' }],
    positions: [{ id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' }],
  });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    const r1 = await k.activate({ owner: 'user-1' });
    const r2 = await k.activate({ owner: 'user-1' }); // repeat — nothing left to do
    assert.equal(r1.state, 'kill_active');
    assert.equal(r2.state, 'kill_active');
    assert.equal(r2.counts.pending_found, 0);
    assert.equal(r2.counts.positions_found, 0);
    assert.equal(r2.reconciled_flat, true);
  } finally { k.close(); cleanup(); }
});

test('4b. kill latch persists across restart (fresh handle, same store)', async () => {
  const file = store();
  const ex = mockExecutor({
    pending: [], positions: [{ id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' }],
  });
  const k1 = createPaperKillSwitch({ filename: file, executor: ex });
  let firstState;
  try { firstState = (await k1.activate({ owner: 'user-1' })).state; } finally { k1.close(); }
  assert.equal(firstState, 'kill_active');
  // Simulated process restart: brand-new handle over the same on-disk store.
  const k2 = createPaperKillSwitch({ filename: file, executor: mockExecutor() });
  try {
    const s = k2.status({ owner: 'user-1' });
    assert.equal(s.state, 'kill_active');
    assert.equal(s.locked, true);
    assert.throws(() => k2.assertEntryAllowed('user-1'), e => e.code === 'entries_locked_kill_active');
  } finally { k2.close(); cleanup(); }
});

test('5. stale-price unresolved close — never invents a fill/flat; entries stay LOCKED', async () => {
  const ex = mockExecutor({
    pending: [{ id: 'o1', owner: 'user-1', symbol: 'BTC-USDT', kind: 'entry' }],
    positions: [
      { id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' },  // closeable
      { id: 'p2', owner: 'user-1', symbol: 'ETH-USDT', quantity: '2.0' },  // stale -> unresolved
    ],
  }, { staleSymbols: new Set(['ETH-USDT']) });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    const r = await k.activate({ owner: 'user-1' });
    assert.equal(r.state, 'kill_active_unresolved');
    assert.equal(r.locked, true);                 // entry lock RETAINED
    assert.equal(r.reconciled_flat, false);        // NOT claimed flat
    assert.equal(r.counts.cancelled, 1);           // eligible order still cancelled
    assert.equal(r.counts.closed, 1);              // BTC closed
    assert.equal(r.counts.close_unresolved, 1);    // ETH unresolved
    assert.equal(r.data_blocker, 'market_data_stale');
    assert.equal(r.unresolved[0].symbol, 'ETH-USDT');
    assert.equal(r.remaining.open, 1);
    assert.ok(ex._positions.has('p2'));            // position untouched — no invented close
    // Still locked afterwards
    assert.throws(() => k.assertEntryAllowed('user-1'), e => e.code === 'entries_locked_kill_active');
  } finally { k.close(); cleanup(); }
});

test('5b. retry after data resolves converges to flat + kill_active', async () => {
  const stale = new Set(['ETH-USDT']);
  const ex = mockExecutor({
    positions: [{ id: 'p2', owner: 'user-1', symbol: 'ETH-USDT', quantity: '2.0' }],
  }, { staleSymbols: stale });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    assert.equal((await k.activate({ owner: 'user-1' })).state, 'kill_active_unresolved');
    stale.delete('ETH-USDT'); // data resolves
    const r2 = await k.activate({ owner: 'user-1' });
    assert.equal(r2.state, 'kill_active');
    assert.equal(r2.reconciled_flat, true);
    assert.equal(ex._positions.size, 0);
  } finally { k.close(); cleanup(); }
});

test('6a. missing owner rejected', async () => {
  const k = createPaperKillSwitch({ filename: store(), executor: mockExecutor() });
  try {
    await assert.rejects(async () => k.activate({}), e => e instanceof KillSwitchError && e.code === 'owner_required' && e.status === 400);
    assert.throws(() => k.status({}), e => e.code === 'owner_required');
    assert.throws(() => k.resume({}), e => e.code === 'owner_required');
  } finally { k.close(); cleanup(); }
});

test('6b. live/real field on activation rejected (live_mode_denied 403)', async () => {
  const k = createPaperKillSwitch({ filename: store(), executor: mockExecutor() });
  try {
    await assert.rejects(async () => k.activate({ owner: 'user-1', input: { live: true } }),
      e => e.code === 'live_mode_denied' && e.status === 403);
    await assert.rejects(async () => k.activate({ owner: 'user-1', input: { real_money: 'yes' } }),
      e => e.code === 'live_mode_denied');
  } finally { k.close(); cleanup(); }
});

test('7. concurrent submit-during-kill rejected via assertEntryAllowed', async () => {
  const ex = mockExecutor({ positions: [{ id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' }] });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    assert.equal(k.assertEntryAllowed('user-1'), true); // allowed before
    await k.activate({ owner: 'user-1' });
    assert.throws(() => k.assertEntryAllowed('user-1'),
      e => e.code === 'entries_locked_kill_active' && e.status === 409);
    // Another owner is unaffected (ownership-scoped lock)
    assert.equal(k.assertEntryAllowed('user-2'), true);
  } finally { k.close(); cleanup(); }
});

test('8a. resume lifts lock; does not reopen closed trades or auto-create entries', async () => {
  const ex = mockExecutor({ positions: [{ id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' }] });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    await k.activate({ owner: 'user-1' });
    const r = k.resume({ owner: 'user-1' });
    assert.equal(r.state, 'inactive');
    assert.equal(r.locked, false);
    assert.equal(r.reopened, false);
    assert.equal(r.auto_created, false);
    assert.equal(k.assertEntryAllowed('user-1'), true); // entries allowed again
    assert.equal(ex._positions.size, 0);                // still flat — nothing reopened
  } finally { k.close(); cleanup(); }
});

test('8b. audit trail is append-only and records request/complete/resume', async () => {
  const ex = mockExecutor({ positions: [{ id: 'p1', owner: 'user-1', symbol: 'BTC-USDT', quantity: '0.5' }] });
  const k = createPaperKillSwitch({ filename: store(), executor: ex });
  try {
    await k.activate({ owner: 'user-1' });
    k.resume({ owner: 'user-1' });
    const audit = k.auditTrail({ owner: 'user-1' });
    const events = audit.map(e => e.event);
    assert.ok(events.includes('kill_requested'));
    assert.ok(events.includes('kill_completed'));
    assert.ok(events.includes('kill_resumed'));
    // append-only: a second cycle grows the log, never truncates
    await k.activate({ owner: 'user-1' });
    assert.ok(k.auditTrail({ owner: 'user-1' }).length > audit.length);
  } finally { k.close(); cleanup(); }
});

test('9. resume before any activation is a safe no-op', async () => {
  const k = createPaperKillSwitch({ filename: store(), executor: mockExecutor() });
  try {
    const r = k.resume({ owner: 'user-1' });
    assert.equal(r.state, 'inactive');
    assert.equal(r.already, true);
  } finally { k.close(); cleanup(); }
});
