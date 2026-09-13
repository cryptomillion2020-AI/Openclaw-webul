// §6 test matrix for the deterministic paper-management engine (PART C, directive 20260912-160705).
// Covers: protective submit · stop trigger · target trigger · manual-cancel-vs-fill race ·
// manual-close-vs-fill race · partial fill · sibling-cancel-on-fill · gap-through-stop ·
// restart mid-bracket reconciliation · duplicate-action idempotency · long & short direction
// validation · stale-data pause · REAL-ORDER-DENIAL regression · conservative both-touched ·
// existing-unprotected-not-retro-assigned · no-autonomous-open/widen.
//
// All PAPER. Isolated temp SQLite fixtures. No live orders, no user-ledger pollution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPaperManagement, evaluateBar, ManagementError, MANAGER_STATES } from './paper-management.mjs';

const CATALOG = { tick: '0.1', lot: '0.00000001' }; // BloFin-style tick/lot
let tmp;
function eng(clock) {
  tmp = mkdtempSync(join(tmpdir(), 'paper-mgmt-'));
  return createPaperManagement({ filename: join(tmp, 'fixture-mgmt.sqlite'), now: clock });
}
function cleanup() { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = null; }

// Fresh BloFin feed builder. mark drives the deterministic evaluation window.
function feed(symbol, mark, atMs, { bidask } = {}) {
  const bid = bidask?.bid ?? mark, ask = bidask?.ask ?? mark;
  return {
    source: 'blofin_public', instrument_class: 'crypto_perp', state: 'fresh',
    ttl_seconds: 30, generated_at: new Date(atMs).toISOString(),
    rows: [{ symbol, state: 'fresh', observed_at_ms: atMs, bid: String(bid), ask: String(ask), mark: String(mark) }],
  };
}
const LONG = (o = {}) => ({ trade_id: 't-long', owner: 'user-1', symbol: 'BTC-USDT', side: 'buy', quantity: '0.10000000', entry: '100.0', stop: '90.0', target: '120.0', catalog: CATALOG, ...o });
const SHORT = (o = {}) => ({ trade_id: 't-short', owner: 'user-1', symbol: 'BTC-USDT', side: 'sell', quantity: '0.10000000', entry: '100.0', stop: '110.0', target: '80.0', catalog: CATALOG, ...o });

// -- pure trigger core -----------------------------------------------------------------------
test('evaluateBar: long stop trigger fills at stop', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '95', high: '96', low: '89', close: '91' });
  assert.equal(d.leg, 'stop'); assert.equal(d.fill_price, '90'); assert.equal(d.gap, false);
});
test('evaluateBar: long target trigger fills at target', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '110', high: '121', low: '109', close: '120' });
  assert.equal(d.leg, 'target'); assert.equal(d.fill_price, '120');
});
test('evaluateBar: gap-through-stop fills at the worse open, not the stop', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '85', high: '86', low: '80', close: '84' });
  assert.equal(d.leg, 'stop'); assert.equal(d.gap, true); assert.equal(d.fill_price, '85');
});
test('evaluateBar: both-touched-in-one-bar resolves stop-first (conservative, never optimistic)', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '100', high: '121', low: '89', close: '110' });
  assert.equal(d.leg, 'stop'); assert.equal(d.both_touched, true); assert.match(d.reason, /conservative/);
});
test('evaluateBar: short stop is above; both-touched still stop-first', () => {
  const d = evaluateBar({ side: 'sell', stop: '110', target: '80' }, { open: '100', high: '111', low: '79', close: '90' });
  assert.equal(d.leg, 'stop'); assert.equal(d.both_touched, true);
});
test('evaluateBar: adverse slippage worsens the stop fill only', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '92', high: '93', low: '89', close: '90' }, { slippage_bps: 100 });
  assert.equal(d.leg, 'stop'); assert.equal(d.fill_price, '89.1'); // 90 - 1%
});
test('evaluateBar: no touch holds', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '100', high: '105', low: '95', close: '101' });
  assert.equal(d.leg, null);
});

// -- proposal validation (direction + precision) ---------------------------------------------
test('propose: valid long bracket → proposed state, disclosures present', () => {
  const e = eng(() => 1000);
  try {
    const r = e.propose(LONG());
    assert.equal(r.bracket.state, 'proposed');
    assert.equal(r.live_mode, false);
    assert.equal(r.bracket.fees_funding_modeled, false);
    assert.ok(r.bracket.disclosures.some(d => /not a guaranteed exact fill/i.test(d)));
    assert.ok(r.bracket.disclosures.some(d => /funding/i.test(d)));
  } finally { e.close(); cleanup(); }
});
test('propose: long with stop above entry is rejected', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(LONG({ stop: '105.0' })), (x) => x instanceof ManagementError && x.code === 'invalid_long_bracket'); }
  finally { e.close(); cleanup(); }
});
test('propose: short with stop below entry is rejected', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(SHORT({ stop: '95.0' })), (x) => x.code === 'invalid_short_bracket'); }
  finally { e.close(); cleanup(); }
});
test('propose: off-tick price is rejected (precision, not fabricated rounding)', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(LONG({ stop: '90.05' })), (x) => x.code === 'tick_precision'); }
  finally { e.close(); cleanup(); }
});
test('propose: missing catalog is rejected (no fabricated tick/lot)', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(LONG({ catalog: undefined })), (x) => x.code === 'catalog_required'); }
  finally { e.close(); cleanup(); }
});
test('propose: misaligned quantity is rejected', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(LONG({ quantity: '0.000000005' })), (x) => x.code === 'quantity_precision'); }
  finally { e.close(); cleanup(); }
});

// -- REAL-ORDER-DENIAL regression ------------------------------------------------------------
test('real-order-denial: any live/real field is refused (403), engine exposes no live path', () => {
  const e = eng(() => 1000);
  try {
    for (const k of ['live', 'live_mode', 'real', 'real_money', 'broker', 'account']) {
      assert.throws(() => e.propose(LONG({ [k]: true })), (x) => x.code === 'live_mode_denied' && x.status === 403, `field ${k} must be denied`);
    }
    assert.equal(e.live_mode, false);
  } finally { e.close(); cleanup(); }
});

// -- confirm + lifecycle ---------------------------------------------------------------------
test('confirm: proposed → confirmed/active; only confirmed brackets are enforced', () => {
  const e = eng(() => 1000);
  try {
    e.propose(LONG());
    const c = e.confirm({ trade_id: 't-long', owner: 'user-1' });
    assert.equal(c.bracket.state, 'confirmed/active');
    assert.ok(MANAGER_STATES.includes(c.bracket.state));
  } finally { e.close(); cleanup(); }
});
test('confirm: wrong owner refused', () => {
  const e = eng(() => 1000);
  try { e.propose(LONG()); assert.throws(() => e.confirm({ trade_id: 't-long', owner: 'intruder' }), (x) => x.code === 'not_owner'); }
  finally { e.close(); cleanup(); }
});

// -- stop / target enforcement via observation -----------------------------------------------
test('onObservation: long stop trigger → sibling-cancel + reduce-only close', () => {
  let t = 1000; const e = eng(() => t);
  const reduces = [];
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    t = 2000; e.onObservation({ feed: feed('BTC-USDT', '100', t) }); // seed prev_mark, no touch
    t = 3000;
    const r = e.onObservation({ feed: feed('BTC-USDT', '88', t), reducePosition: (a) => { reduces.push(a); return { reduced: true }; } });
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].leg, 'stop');
    const b = e.get('t-long');
    assert.equal(b.state, 'closed');
    assert.equal(b.triggered.leg, 'stop');
    // sibling cancel is intrinsic (single OCO record) + reduce-only close happened
    assert.equal(reduces.length, 1);
    assert.equal(reduces[0].leg, 'stop');
    const trail = e.auditTrail();
    assert.ok(trail.some(a => a.event === 'trigger' && a.sibling_cancelled === 'target'));
    assert.ok(trail.some(a => a.event === 'closed' && a.reduce_only === true));
  } finally { e.close(); cleanup(); }
});
test('onObservation: long target trigger closes reduce-only', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    t = 2000; e.onObservation({ feed: feed('BTC-USDT', '100', t) });
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '121', t) });
    assert.equal(r.events[0].leg, 'target');
    assert.equal(e.get('t-long').state, 'closed');
  } finally { e.close(); cleanup(); }
});
test('onObservation: gap-through-stop between polls fills at worse observed price', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    t = 2000; e.onObservation({ feed: feed('BTC-USDT', '100', t) });
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '82', t) }); // overshot below stop 90 between polls
    assert.equal(r.events[0].leg, 'stop');
    assert.equal(e.get('t-long').triggered.gap, true);
    assert.equal(e.get('t-long').triggered.fill_price, '82'); // worse observed mark, not an optimistic 90
  } finally { e.close(); cleanup(); }
});

// -- races: manual cancel/close vs fill ------------------------------------------------------
test('race: manual cancel before any trigger → cancelled, later observation is a no-op', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    const c = e.cancel({ trade_id: 't-long', owner: 'user-1' });
    assert.equal(c.bracket.state, 'cancelled');
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '80', t) });
    assert.equal(r.events.length, 0); // cancelled brackets are not enforced
    assert.equal(e.get('t-long').state, 'cancelled');
  } finally { e.close(); cleanup(); }
});
test('race: manual cancel AFTER trigger is refused (already resolved — no double action)', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    t = 2000; e.onObservation({ feed: feed('BTC-USDT', '100', t) });
    t = 3000; e.onObservation({ feed: feed('BTC-USDT', '80', t) });
    assert.equal(e.get('t-long').state, 'closed');
    assert.throws(() => e.cancel({ trade_id: 't-long', owner: 'user-1' }), (x) => x.code === 'already_resolved');
  } finally { e.close(); cleanup(); }
});

// -- idempotency -----------------------------------------------------------------------------
test('idempotency: duplicate requestKey returns the same result, no second action', () => {
  const e = eng(() => 1000);
  try {
    const a = e.propose(LONG({ requestKey: 'req-propose-001' }));
    const b = e.propose(LONG({ requestKey: 'req-propose-001' }));
    assert.equal(a.duplicate, false); assert.equal(b.duplicate, true);
    assert.equal(a.bracket.trade_id, b.bracket.trade_id);
  } finally { e.close(); cleanup(); }
});
test('idempotency: same key with different payload conflicts (409)', () => {
  const e = eng(() => 1000);
  try {
    e.propose(LONG({ requestKey: 'conflict-key-1' }));
    assert.throws(() => e.propose(LONG({ trade_id: 't-other', requestKey: 'conflict-key-1' })), (x) => x.code === 'idempotency_conflict');
  } finally { e.close(); cleanup(); }
});
test('propose: duplicate trade_id without key is refused (bracket_exists)', () => {
  const e = eng(() => 1000);
  try { e.propose(LONG()); assert.throws(() => e.propose(LONG()), (x) => x.code === 'bracket_exists'); }
  finally { e.close(); cleanup(); }
});

// -- stale data pause ------------------------------------------------------------------------
test('stale data: expired feed pauses enforcement (stale/unmanaged) + alert, no simulated fill', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    t = 100000; // far ahead of the feed's observed_at → stale beyond ttl
    const r = e.onObservation({ feed: feed('BTC-USDT', '80', 1000) }); // price beyond stop but STALE
    assert.equal(r.events.length, 0);
    assert.equal(r.alerts.length, 1);
    assert.equal(r.alerts[0].reason, 'market_data_stale');
    assert.equal(e.get('t-long').state, 'stale/unmanaged');
  } finally { e.close(); cleanup(); }
});
test('invalid quote (non-blofin source) pauses, never enforces', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    const bad = feed('BTC-USDT', '80', 1000); bad.source = 'somewhere_else';
    t = 2000; const r = e.onObservation({ feed: bad });
    assert.equal(r.alerts[0].reason, 'approved_perp_data_unavailable');
    assert.equal(e.get('t-long').state, 'stale/unmanaged');
  } finally { e.close(); cleanup(); }
});

// -- restart reconciliation ------------------------------------------------------------------
test('restart: persisted active bracket survives reopen and is reconciled before resuming', () => {
  let t = 1000; const file = join(mkdtempSync(join(tmpdir(), 'paper-mgmt-')), 'fixture-mgmt.sqlite');
  const e1 = createPaperManagement({ filename: file, now: () => t });
  e1.propose(LONG()); e1.confirm({ trade_id: 't-long', owner: 'user-1' });
  t = 2000; e1.onObservation({ feed: feed('BTC-USDT', '100', t) }); // prev_mark persisted
  e1.close();
  // "restart": brand-new engine on the same file
  const e2 = createPaperManagement({ filename: file, now: () => t });
  try {
    assert.equal(e2.get('t-long').state, 'confirmed/active'); // persisted
    t = 3000;
    const rec = e2.reconcile({ feed: feed('BTC-USDT', '100', t) });
    assert.ok(rec.reconciled.some(x => x.trade_id === 't-long' && x.state === 'confirmed/active'));
    // enforcement resumes correctly post-restart
    const r = e2.onObservation({ feed: feed('BTC-USDT', '88', t) });
    assert.equal(r.events[0].leg, 'stop');
    assert.equal(e2.get('t-long').state, 'closed');
  } finally { e2.close(); rmSync(file.replace(/fixture-mgmt\.sqlite$/, ''), { recursive: true, force: true }); }
});
test('restart: stale-paused bracket resumes to active once data is valid again', () => {
  let t = 1000; const file = join(mkdtempSync(join(tmpdir(), 'paper-mgmt-')), 'fixture-mgmt.sqlite');
  const e1 = createPaperManagement({ filename: file, now: () => t });
  e1.propose(LONG()); e1.confirm({ trade_id: 't-long', owner: 'user-1' });
  t = 100000; e1.onObservation({ feed: feed('BTC-USDT', '100', 1000) }); // goes stale
  assert.equal(e1.get('t-long').state, 'stale/unmanaged');
  e1.close();
  const e2 = createPaperManagement({ filename: file, now: () => t });
  try {
    t = 100001;
    const rec = e2.reconcile({ feed: feed('BTC-USDT', '100', t) }); // fresh again
    assert.ok(rec.reconciled.some(x => x.trade_id === 't-long' && x.state === 'confirmed/active'));
  } finally { e2.close(); rmSync(file.replace(/fixture-mgmt\.sqlite$/, ''), { recursive: true, force: true }); }
});

// -- existing unprotected positions: never retro-assigned -------------------------------------
test('listUnprotected: open positions with no confirmed bracket are unprotected/needs-levels, never retro-assigned', () => {
  const e = eng(() => 1000);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    const positions = [
      { id: 't-long', owner: 'user-1', symbol: 'BTC-USDT', side: 'buy', quantity: '0.1' },   // managed
      { id: 't-legacy', owner: 'user-1', symbol: 'ETH-USDT', side: 'buy', quantity: '1.0' },  // unprotected
    ];
    const un = e.listUnprotected(positions, { owner: 'user-1' });
    assert.equal(un.length, 1);
    assert.equal(un[0].trade_id, 't-legacy');
    assert.equal(un[0].state, 'unprotected');
    assert.match(un[0].note, /never retro-assigned/);
  } finally { e.close(); cleanup(); }
});

// -- short direction end-to-end --------------------------------------------------------------
test('short: stop above triggers on upward move, reduce-only close', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(SHORT()); e.confirm({ trade_id: 't-short', owner: 'user-1' });
    t = 2000; e.onObservation({ feed: feed('BTC-USDT', '100', t) });
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '112', t) }); // above short stop 110
    assert.equal(r.events[0].leg, 'stop');
    assert.equal(e.get('t-short').state, 'closed');
  } finally { e.close(); cleanup(); }
});

// -- no autonomous mutation: engine never opens/widens on its own -----------------------------
test('no autonomous action: an observation with no touch never mutates levels or opens anything', () => {
  let t = 1000; const e = eng(() => t);
  try {
    e.propose(LONG()); e.confirm({ trade_id: 't-long', owner: 'user-1' });
    const before = e.get('t-long');
    t = 2000; e.onObservation({ feed: feed('BTC-USDT', '101', t) });
    t = 3000; e.onObservation({ feed: feed('BTC-USDT', '102', t) });
    const after = e.get('t-long');
    assert.equal(after.state, 'confirmed/active');
    assert.equal(after.stop, before.stop);   // never widened
    assert.equal(after.target, before.target);
    assert.equal(after.quantity, before.quantity); // never resized
  } finally { e.close(); cleanup(); }
});
