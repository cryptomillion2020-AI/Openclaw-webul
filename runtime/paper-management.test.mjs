// §6/§7 test matrix — deterministic paper-management engine, QUANT Contract v1.0.0
//   (governing spec sha256 ea14e555633998d2cccbab036dcc425bc1481670d1ca557069dd3635f979fef5).
// Covers: §1.1 states · §1.2 proposal record · §1.4 direction/would-trigger-immediately/
//   conservative-rounding/live-catalog/freshness at propose+confirm · §1.5 reduce-only clamp ·
//   §3.4 executable bid/ask fills (never last) · §3.5 atomic OCO + idempotent observation ·
//   §3.6 resolution_basis (snapshot_adverse / candle_adverse, stop-first) · §3.3 reconcile w/
//   gap candles · §3.8 event-sourced pure fold + hash chain + rebuild · REAL-ORDER-DENIAL (403).
//
// All PAPER. Isolated temp SQLite fixtures. No live orders, no user-ledger pollution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPaperManagement, evaluateBar, evaluateSnapshot, ManagementError, MANAGER_STATES } from './paper-management.mjs';

const CATALOG = { tick: '0.1', lot: '0.00000001', state: 'live' }; // BloFin-style tick/lot, verified live
let tmp;
function eng(clock) {
  tmp = mkdtempSync(join(tmpdir(), 'paper-mgmt-'));
  return createPaperManagement({ filename: join(tmp, 'fixture-mgmt.sqlite'), now: clock });
}
function cleanup() { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = null; }

// Fresh BloFin feed builder. bid/ask are the executable prices; mark drives trigger_reference=last.
function feed(symbol, mark, atMs, { bidask } = {}) {
  const bid = bidask?.bid ?? mark, ask = bidask?.ask ?? mark;
  return {
    source: 'blofin_public', instrument_class: 'crypto_perp', state: 'fresh',
    ttl_seconds: 30, generated_at: new Date(atMs).toISOString(), channel: 'tickers',
    rows: [{ symbol, state: 'fresh', observed_at_ms: atMs, bid: String(bid), ask: String(ask), mark: String(mark) }],
  };
}
// A quote near entry 100 that never triggers immediately for the standard brackets.
const mkq = (atMs) => feed('BTC-USDT', '100', atMs, { bidask: { bid: '100', ask: '100' } });
const LONG = (o = {}) => ({ trade_id: 't-long', owner: 'user-1', symbol: 'BTC-USDT', side: 'buy', quantity: '0.10000000', entry: '100.0', stop: '90.0', target: '120.0', catalog: CATALOG, ...o });
const SHORT = (o = {}) => ({ trade_id: 't-short', owner: 'user-1', symbol: 'BTC-USDT', side: 'sell', quantity: '0.10000000', entry: '100.0', stop: '110.0', target: '80.0', catalog: CATALOG, ...o });
const proposeLong = (e, t = 1000, o = {}) => e.propose(LONG({ quote: mkq(t), ...o }));
const proposeShort = (e, t = 1000, o = {}) => e.propose(SHORT({ quote: mkq(t), ...o }));
const confirmLong = (e, t = 1000) => e.confirm({ trade_id: 't-long', owner: 'user-1', quote: mkq(t) });

// -- §3.6 pure candle evaluator (outage/reconcile path) --------------------------------------
test('evaluateBar: long stop trigger fills at stop', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '95', high: '96', low: '89', close: '91' });
  assert.equal(d.leg, 'stop'); assert.equal(d.fill_price, '90'); assert.equal(d.gap, false);
  assert.equal(d.resolution_basis, 'candle_adverse');
});
test('evaluateBar: long target trigger fills at target', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '110', high: '121', low: '109', close: '120' });
  assert.equal(d.leg, 'target'); assert.equal(d.fill_price, '120');
});
test('evaluateBar: gap-through-stop fills at the worse open, not the stop', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '85', high: '86', low: '80', close: '84' });
  assert.equal(d.leg, 'stop'); assert.equal(d.gap, true); assert.equal(d.fill_price, '85');
});
test('evaluateBar: both-touched-in-one-bar resolves stop-first (candle_adverse)', () => {
  const d = evaluateBar({ side: 'buy', stop: '90', target: '120' }, { open: '100', high: '121', low: '89', close: '110' });
  assert.equal(d.leg, 'stop'); assert.equal(d.both_touched, true); assert.equal(d.reason, 'both_touched_stop_first');
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

// -- §3.4 pure snapshot evaluator: fills use executable bid/ask, NEVER last -------------------
test('evaluateSnapshot: long stop fills at executable bid when it gaps below the stop, not `last`', () => {
  const d = evaluateSnapshot({ side: 'buy', stop: '90', target: '120' }, { ref: '89', bid: '88', ask: '88.2' });
  assert.equal(d.leg, 'stop'); assert.equal(d.fill_price, '88'); assert.equal(d.gap, true);
  assert.equal(d.resolution_basis, 'snapshot_adverse');
});
test('evaluateSnapshot: long stop with bid above stop fills at the stop (no better than stop)', () => {
  const d = evaluateSnapshot({ side: 'buy', stop: '90', target: '120' }, { ref: '90', bid: '90.5', ask: '90.7' });
  assert.equal(d.leg, 'stop'); assert.equal(d.fill_price, '90'); assert.equal(d.gap, false);
});
test('evaluateSnapshot: long target fills at min(target,bid) — never better than target', () => {
  const d = evaluateSnapshot({ side: 'buy', stop: '90', target: '120' }, { ref: '121', bid: '120.5', ask: '121' });
  assert.equal(d.leg, 'target'); assert.equal(d.fill_price, '120');
});
test('evaluateSnapshot: short stop uses the ask (closing a short BUYS)', () => {
  const d = evaluateSnapshot({ side: 'sell', stop: '110', target: '80' }, { ref: '111', bid: '110.8', ask: '111' });
  assert.equal(d.leg, 'stop'); assert.equal(d.fill_price, '111'); assert.equal(d.gap, true);
});
test('evaluateSnapshot: no touch holds', () => {
  const d = evaluateSnapshot({ side: 'buy', stop: '90', target: '120' }, { ref: '100', bid: '100', ask: '100' });
  assert.equal(d.leg, null);
});

// -- §1.2/§1.4 proposal validation -----------------------------------------------------------
test('propose: valid long bracket → proposed, §1.2 record fields + disclosures present', () => {
  const e = eng(() => 1000);
  try {
    const r = proposeLong(e);
    const b = r.bracket;
    assert.equal(b.state, 'proposed');
    assert.equal(r.live_mode, false);
    assert.equal(b.fees_funding_modeled, false);
    assert.equal(b.entry_ref, '100'); assert.equal(b.trigger_reference, 'last');
    assert.ok(b.derivation === 'strategy' || b.derivation === 'user_entered');
    assert.ok(b.computed && b.computed.risk === '10'); // |100-90|
    assert.equal(b.computed.reward, '20'); // |120-100|
    assert.ok(b.validity && b.validity.expires_at);
    assert.ok(b.disclosures.some(d => /not a guaranteed exact fill/i.test(d)));
    assert.ok(b.disclosures.some(d => /funding/i.test(d)));
  } finally { e.close(); cleanup(); }
});
test('propose: long with stop above entry → direction_invalid', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => proposeLong(e, 1000, { stop: '105.0' }), (x) => x instanceof ManagementError && x.code === 'direction_invalid'); }
  finally { e.close(); cleanup(); }
});
test('propose: short with stop below entry → direction_invalid', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => proposeShort(e, 1000, { stop: '95.0' }), (x) => x.code === 'direction_invalid'); }
  finally { e.close(); cleanup(); }
});
test('propose: off-tick price is ROUNDED toward entry (conservative), disclosed, not rejected', () => {
  const e = eng(() => 1000);
  try {
    const r = proposeLong(e, 1000, { stop: '90.05' }); // → rounds UP toward entry to 90.1 (never widens risk)
    assert.equal(r.bracket.stop, '90.1');
    assert.ok(r.bracket.disclosures.some(d => /rounded to tick toward entry/i.test(d)));
  } finally { e.close(); cleanup(); }
});
test('propose: quote is REQUIRED (§1.4 would-trigger + freshness cannot be silently skipped)', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(LONG()), (x) => x.code === 'quote_required'); }
  finally { e.close(); cleanup(); }
});
test('propose: level already on the wrong side of the quote → would_trigger_immediately', () => {
  const e = eng(() => 1000);
  try {
    const q = feed('BTC-USDT', '100', 1000, { bidask: { bid: '89', ask: '89' } }); // bid below stop 90
    assert.throws(() => e.propose(LONG({ quote: q })), (x) => x.code === 'would_trigger_immediately');
  } finally { e.close(); cleanup(); }
});
test('propose: catalog not live → instrument_unverified (no fabricated instrument state)', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(LONG({ quote: mkq(1000), catalog: { tick: '0.1', lot: '0.00000001', state: 'unknown' } })), (x) => x.code === 'instrument_unverified'); }
  finally { e.close(); cleanup(); }
});
test('propose: missing catalog is rejected (no fabricated tick/lot)', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => e.propose(LONG({ quote: mkq(1000), catalog: undefined })), (x) => x.code === 'catalog_required'); }
  finally { e.close(); cleanup(); }
});
test('propose: misaligned quantity is rejected (lot precision, never rounded)', () => {
  const e = eng(() => 1000);
  try { assert.throws(() => proposeLong(e, 1000, { quantity: '0.000000005' }), (x) => x.code === 'quantity_precision'); }
  finally { e.close(); cleanup(); }
});

// -- REAL-ORDER-DENIAL regression ------------------------------------------------------------
test('real-order-denial: any live/real field is refused (403), engine exposes no live path', () => {
  const e = eng(() => 1000);
  try {
    for (const k of ['live', 'live_mode', 'real', 'real_money', 'broker', 'account']) {
      assert.throws(() => e.propose(LONG({ quote: mkq(1000), [k]: true })), (x) => x.code === 'live_mode_denied' && x.status === 403, `field ${k} must be denied`);
    }
    assert.equal(e.live_mode, false);
  } finally { e.close(); cleanup(); }
});

// -- §1.3 confirm + lifecycle ----------------------------------------------------------------
test('confirm: proposed → active; state is a valid MANAGER_STATE', () => {
  const e = eng(() => 1000);
  try {
    proposeLong(e); const c = confirmLong(e);
    assert.equal(c.bracket.state, 'active');
    assert.ok(MANAGER_STATES.includes(c.bracket.state));
  } finally { e.close(); cleanup(); }
});
test('confirm: re-validates would-trigger-immediately against a fresh quote', () => {
  const e = eng(() => 1000);
  try {
    proposeLong(e);
    const bad = feed('BTC-USDT', '100', 1000, { bidask: { bid: '89', ask: '89' } });
    assert.throws(() => e.confirm({ trade_id: 't-long', owner: 'user-1', quote: bad }), (x) => x.code === 'would_trigger_immediately');
  } finally { e.close(); cleanup(); }
});
test('confirm: wrong owner refused', () => {
  const e = eng(() => 1000);
  try { proposeLong(e); assert.throws(() => e.confirm({ trade_id: 't-long', owner: 'intruder', quote: mkq(1000) }), (x) => x.code === 'not_owner'); }
  finally { e.close(); cleanup(); }
});

// -- §3.4/§3.5 stop / target enforcement via observation --------------------------------------
test('onObservation: long stop trigger → sibling-cancel + reduce-only close, resolution snapshot_adverse', () => {
  let t = 1000; const e = eng(() => t);
  const reduces = [];
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 3000;
    const r = e.onObservation({ feed: feed('BTC-USDT', '90', t, { bidask: { bid: '90.1', ask: '90.3' } }), reducePosition: (a) => { reduces.push(a); return { reduced: true }; } });
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].leg, 'stop');
    assert.equal(r.events[0].resolution_basis, 'snapshot_adverse');
    const b = e.get('t-long');
    assert.equal(b.state, 'closed_stop');
    assert.equal(b.triggered.leg, 'stop');
    assert.equal(reduces.length, 1);
    assert.equal(reduces[0].leg, 'stop');
    const trail = e.auditTrail();
    assert.ok(trail.some(a => a.event === 'leg_triggered' && a.leg === 'stop'));
    assert.ok(trail.some(a => a.event === 'sibling_cancelled' && a.leg === 'target'));
    assert.ok(trail.some(a => a.event === 'fill_written'));
  } finally { e.close(); cleanup(); }
});
test('onObservation: long target trigger closes reduce-only → closed_target', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '121', t, { bidask: { bid: '121', ask: '121.2' } }) });
    assert.equal(r.events[0].leg, 'target');
    assert.equal(e.get('t-long').state, 'closed_target');
  } finally { e.close(); cleanup(); }
});
test('onObservation: gap-through-stop fills at the executable bid, not an optimistic stop', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '82', t, { bidask: { bid: '82', ask: '82.2' } }) });
    assert.equal(r.events[0].leg, 'stop');
    assert.equal(e.get('t-long').triggered.gap, true);
    assert.equal(e.get('t-long').triggered.fill_price, '82');
  } finally { e.close(); cleanup(); }
});
test('onObservation: duplicate feed delivery does not double-close (idempotent)', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 3000; const q = feed('BTC-USDT', '90', t, { bidask: { bid: '90.1', ask: '90.3' } });
    const r1 = e.onObservation({ feed: q });
    const r2 = e.onObservation({ feed: q }); // same observation replayed
    assert.equal(r1.events.length, 1);
    assert.equal(r2.events.length, 0);
    assert.equal(e.get('t-long').state, 'closed_stop');
  } finally { e.close(); cleanup(); }
});

// -- §1.1 races: manual cancel/close vs fill -------------------------------------------------
test('race: manual cancel before any trigger → unprotected (position remains), later obs is a no-op', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    const c = e.cancel({ trade_id: 't-long', owner: 'user-1' });
    assert.equal(c.bracket.state, 'unprotected');
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '80', t, { bidask: { bid: '80', ask: '80' } }) });
    assert.equal(r.events.length, 0); // unprotected brackets are not enforced
    assert.equal(e.get('t-long').state, 'unprotected');
  } finally { e.close(); cleanup(); }
});
test('race: manual cancel AFTER trigger is refused (already resolved — no double action)', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 3000; e.onObservation({ feed: feed('BTC-USDT', '80', t, { bidask: { bid: '80', ask: '80' } }) });
    assert.equal(e.get('t-long').state, 'closed_stop');
    assert.throws(() => e.cancel({ trade_id: 't-long', owner: 'user-1' }), (x) => x.code === 'already_resolved');
  } finally { e.close(); cleanup(); }
});
test('closePosition: manual reduce-only close → closed_manual; later obs is a no-op', () => {
  let t = 1000; const e = eng(() => t);
  const reduces = [];
  try {
    proposeLong(e, t); confirmLong(e, t);
    const c = e.closePosition({ trade_id: 't-long', owner: 'user-1', fill_price: '95', reducePosition: (a) => { reduces.push(a); return {}; } });
    assert.equal(c.bracket.state, 'closed_manual');
    assert.equal(reduces.length, 1);
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '80', t, { bidask: { bid: '80', ask: '80' } }) });
    assert.equal(r.events.length, 0);
  } finally { e.close(); cleanup(); }
});

// -- §1.5 reduce-only quantity clamp ---------------------------------------------------------
test('reduceQuantity: bracket qty clamps to min(leg, position), never increases', () => {
  const e = eng(() => 1000);
  try {
    proposeLong(e); confirmLong(e);
    const a = e.reduceQuantity({ trade_id: 't-long', owner: 'user-1', position_quantity: '0.05000000' });
    assert.equal(a.bracket.quantity, '0.05');
    const b = e.reduceQuantity({ trade_id: 't-long', owner: 'user-1', position_quantity: '0.08000000' }); // larger → no-op
    assert.equal(b.bracket.quantity, '0.05');
    assert.ok(e.auditTrail().some(x => x.event === 'quantity_reduced'));
  } finally { e.close(); cleanup(); }
});

// -- idempotency -----------------------------------------------------------------------------
test('idempotency: duplicate requestKey returns the same result, no second action', () => {
  const e = eng(() => 1000);
  try {
    const a = proposeLong(e, 1000, { requestKey: 'req-propose-001' });
    const b = proposeLong(e, 1000, { requestKey: 'req-propose-001' });
    assert.equal(a.duplicate, false); assert.equal(b.duplicate, true);
    assert.equal(a.bracket.trade_id, b.bracket.trade_id);
  } finally { e.close(); cleanup(); }
});
test('idempotency: same key with different payload conflicts (409)', () => {
  const e = eng(() => 1000);
  try {
    proposeLong(e, 1000, { requestKey: 'conflict-key-1' });
    assert.throws(() => proposeLong(e, 1000, { trade_id: 't-other', requestKey: 'conflict-key-1' }), (x) => x.code === 'idempotency_conflict');
  } finally { e.close(); cleanup(); }
});
test('propose: duplicate trade_id without key is refused (bracket_exists)', () => {
  const e = eng(() => 1000);
  try { proposeLong(e); assert.throws(() => proposeLong(e), (x) => x.code === 'bracket_exists'); }
  finally { e.close(); cleanup(); }
});

// -- stale data pause ------------------------------------------------------------------------
test('stale data: expired feed pauses enforcement (stale_unmanaged) + alert, no simulated fill', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 100000; // far beyond the feed's observed_at → stale beyond ttl
    const r = e.onObservation({ feed: feed('BTC-USDT', '80', 1000, { bidask: { bid: '80', ask: '80' } }) });
    assert.equal(r.events.length, 0);
    assert.equal(r.alerts.length, 1);
    assert.equal(r.alerts[0].reason, 'market_data_stale');
    assert.equal(e.get('t-long').state, 'stale_unmanaged');
  } finally { e.close(); cleanup(); }
});
test('invalid quote (non-blofin source) pauses, never enforces', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    const bad = feed('BTC-USDT', '80', 1000, { bidask: { bid: '80', ask: '80' } }); bad.source = 'somewhere_else';
    t = 2000; const r = e.onObservation({ feed: bad });
    assert.equal(r.alerts[0].reason, 'approved_perp_data_unavailable');
    assert.equal(e.get('t-long').state, 'stale_unmanaged');
  } finally { e.close(); cleanup(); }
});

// -- §3.3 restart / reconciliation -----------------------------------------------------------
test('restart: persisted active bracket survives reopen and reconciles before resuming', () => {
  let t = 1000; const dir = mkdtempSync(join(tmpdir(), 'paper-mgmt-')); const file = join(dir, 'fixture-mgmt.sqlite');
  const e1 = createPaperManagement({ filename: file, now: () => t });
  e1.propose(LONG({ quote: mkq(t) })); e1.confirm({ trade_id: 't-long', owner: 'user-1', quote: mkq(t) });
  e1.close();
  const e2 = createPaperManagement({ filename: file, now: () => t }); // "restart" on same file
  try {
    assert.equal(e2.get('t-long').state, 'active'); // persisted
    t = 3000;
    const rec = e2.reconcile({ feed: mkq(t) });
    assert.ok(rec.reconciled.some(x => x.trade_id === 't-long' && x.state === 'active'));
    const r = e2.onObservation({ feed: feed('BTC-USDT', '88', t, { bidask: { bid: '88', ask: '88' } }) });
    assert.equal(r.events[0].leg, 'stop');
    assert.equal(e2.get('t-long').state, 'closed_stop');
  } finally { e2.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('reconcile: outage gap candle closes stop-first with candle_adverse basis', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 5000;
    const rec = e.reconcile({ feed: mkq(t), gapCandles: { 'BTC-USDT': [{ ts: 4000, open: '85', high: '86', low: '80', close: '84' }] } });
    assert.ok(rec.reconciled.some(x => x.trade_id === 't-long' && x.state === 'closed_stop'));
    const b = e.get('t-long');
    assert.equal(b.state, 'closed_stop');
    assert.equal(b.triggered.resolution_basis, 'candle_adverse');
    assert.equal(b.triggered.fill_price, '85');
  } finally { e.close(); cleanup(); }
});
test('reconcile: rerun is idempotent (same gap candle does not re-trigger)', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 5000; const candles = { 'BTC-USDT': [{ ts: 4000, open: '85', high: '86', low: '80', close: '84' }] };
    e.reconcile({ feed: mkq(t), gapCandles: candles });
    const trailLen1 = e.auditTrail({ limit: 500 }).filter(a => a.event === 'fill_written').length;
    e.reconcile({ feed: mkq(t), gapCandles: candles }); // rerun
    const trailLen2 = e.auditTrail({ limit: 500 }).filter(a => a.event === 'fill_written').length;
    assert.equal(trailLen1, trailLen2); // no second fill
  } finally { e.close(); cleanup(); }
});

// -- §3.8 event-sourced pure fold + hash chain -----------------------------------------------
test('rebuild: state is a pure fold — dropping and refolding the cache is identical', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 3000; e.onObservation({ feed: feed('BTC-USDT', '90', t, { bidask: { bid: '90.1', ask: '90.3' } }) });
    const before = e.get('t-long');
    const res = e.rebuild();
    assert.ok(res.rebuilt >= 1);
    const after = e.get('t-long');
    assert.deepEqual(after, before);
  } finally { e.close(); cleanup(); }
});
test('verifyChain: the per-owner event hash chain is intact', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    t = 3000; e.onObservation({ feed: feed('BTC-USDT', '121', t, { bidask: { bid: '121', ask: '121.2' } }) });
    const v = e.verifyChain({ owner: 'user-1' });
    assert.equal(v.ok, true); assert.ok(v.checked > 0);
  } finally { e.close(); cleanup(); }
});

// -- §2 existing unprotected positions: never retro-assigned ----------------------------------
test('listUnprotected: open positions with no bracket are unprotected/needs-levels, never retro-assigned', () => {
  const e = eng(() => 1000);
  try {
    proposeLong(e); confirmLong(e);
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
test('short: stop above triggers on upward move, reduce-only close → closed_stop', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeShort(e, t); e.confirm({ trade_id: 't-short', owner: 'user-1', quote: mkq(t) });
    t = 3000; const r = e.onObservation({ feed: feed('BTC-USDT', '112', t, { bidask: { bid: '111.8', ask: '112' } }) });
    assert.equal(r.events[0].leg, 'stop');
    assert.equal(e.get('t-short').state, 'closed_stop');
  } finally { e.close(); cleanup(); }
});

// -- no autonomous mutation: engine never opens/widens on its own -----------------------------
test('no autonomous action: an observation with no touch never mutates levels or opens anything', () => {
  let t = 1000; const e = eng(() => t);
  try {
    proposeLong(e, t); confirmLong(e, t);
    const before = e.get('t-long');
    t = 2000; e.onObservation({ feed: feed('BTC-USDT', '101', t, { bidask: { bid: '101', ask: '101' } }) });
    t = 3000; e.onObservation({ feed: feed('BTC-USDT', '102', t, { bidask: { bid: '102', ask: '102' } }) });
    const after = e.get('t-long');
    assert.equal(after.state, 'active');
    assert.equal(after.stop, before.stop);   // never widened
    assert.equal(after.target, before.target);
    assert.equal(after.quantity, before.quantity); // never resized
  } finally { e.close(); cleanup(); }
});
