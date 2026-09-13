// Deterministic PAPER trade-protection engine.
// Implements QUANT Paper-Management Contract v1.0.0
//   (sha256 ea14e555633998d2cccbab036dcc425bc1481670d1ca557069dd3635f979fef5, 28,599 bytes),
//   which supersedes the v0.1 §1/§3/§4/§5 detail. v0.1 §0 (hard boundaries) and §2 remain in force.
//
// HARD BOUNDARIES (contract §0 — non-negotiable):
//   - PAPER ONLY. No broker, no account, no network, no live order endpoint. NO code path from this
//     module to a real order. LIVE_MODE / real-money hard denial stays intact: any live/real flag on
//     an input is refused outright (assertPaperOnly → 403 live_mode_denied).
//   - Deterministic CODE, not the LLM. QUANT is NOT in the per-tick path; QUANT derives levels (§5)
//     off-tick and this engine only ENFORCES already-CONFIRMED levels. No invented %/price/tolerance.
//   - No autonomous open/widen/resize/target-change. Trailing/breakeven NOT default-on (§4).
//   - Existing trades never retro-assigned protection (§2): listed unprotected/needs-levels.
//
// CONTRACT MECHANICS (v1.0.0):
//   - §3.8 EVENT-SOURCED: the append-only hash-chained `events` log is the source of truth; state is
//     a PURE FOLD over it (foldTrade). The `state_cache` table is a rebuildable materialization — no
//     mutable current-levels field exists outside the fold. rebuild() drops the cache and refolds.
//   - §3.4 fills use the executable bid (closing a long = SELL) / ask (closing a short = BUY), never
//     `last`/`mark`; a stop is NOT a guaranteed exact fill; slippage is an adverse-only displayed
//     constant. §3.6 both-touched → stop first, basis snapshot_adverse (ticker) / candle_adverse.
//   - §1.4 validation (direction, would_trigger_immediately, precision w/ conservative rounding toward
//     entry, instrument live-catalog, freshness) at propose AND re-validated at confirm.
//   - Exact fixed-point (paper-decimal, scale-12) math — never float compares. SQLite BEGIN IMMEDIATE
//     serializes every mutation; idempotent by requestKey and, for triggers, by (bracket_id, obs_id).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { parse, format, SCALE } from './paper-decimal.mjs';

export class ManagementError extends Error { constructor(code, status = 422, detail) { super(code); this.code = code; this.status = status; this.detail = detail || null; } }
const fail = (c, s = 422, d) => { throw new ManagementError(c, s, d); };

// Contract §1.1 states.
export const MANAGER_STATES = Object.freeze([
  'unprotected', 'proposed', 'active', 'triggered',
  'closed_stop', 'closed_target', 'closed_manual', 'stale_unmanaged', 'reconciling',
]);
const TERMINAL = new Set(['closed_stop', 'closed_target', 'closed_manual']);
const LIVE_FORBIDDEN = ['live', 'live_mode', 'real', 'real_money', 'broker', 'endpoint', 'api_key', 'account'];

// §9 DISPLAYED operational constants — NOT financial tolerances (no risk %, no stop distance, no target multiple).
export const OPERATIONAL_CONSTANTS = Object.freeze({
  staleness_bound: Object.freeze({ tickers_multiple: 3, books_multiple: 5, trades_multiple: 3, tickers_cadence_ms: 1000, books_cadence_ms: 100 }),
  proposal_ttl_ms: 120000,
  slippage_bps_default: 0,
  slippage_note: 'slippage not modelled',
  funding_note: 'funding not modelled',
  fees_note: 'fees not modelled unless a user-entered per-side rate is supplied',
  trigger_reference_default: 'last',
  measured_observation: 'ticker cadence p50 ~500ms / p95 ~540ms (measured); stop precision >= ~1s; sub-second NOT claimed',
});

// Any hint of a live/real order path is refused. This engine has no such path and never will.
function assertPaperOnly(obj) {
  if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) {
    if (LIVE_FORBIDDEN.includes(k.toLowerCase()) && obj[k]) fail('live_mode_denied', 403, `Field '${k}' is refused: this engine is PAPER-ONLY and exposes no real-order path.`);
  }
}
export { assertPaperOnly };

const dec = (x) => { try { return parse(x); } catch { fail('invalid_decimal', 400, `not a decimal: ${x}`); } };
// Quantity precision: scale-12 fixed point, lot = 1e-8 (matches paper-simulation qty rule n%10000n).
const isLotAligned = (n) => n > 0n && n % 10000n === 0n;
function onTick(valueDec, tickDec) { return tickDec > 0n && valueDec > 0n && valueDec % tickDec === 0n; }
// Conservative rounding TOWARD entry (§1.4): stop never widens risk; target never inflates reward.
function roundTowardEntry(priceDec, entryDec, tickDec) {
  if (tickDec <= 0n) return priceDec;
  const rem = priceDec % tickDec;
  if (rem === 0n) return priceDec;
  const down = priceDec - rem, up = down + tickDec;
  return priceDec < entryDec ? up : down; // below entry → round UP toward entry; above entry → round DOWN toward entry
}
const iso = (ms) => new Date(ms).toISOString();

const canonical = (x) => x === null || typeof x !== 'object' ? JSON.stringify(x) : Array.isArray(x) ? '[' + x.map(canonical).join(',') + ']' : '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
const fingerprint = (x) => createHash('sha256').update(canonical(x)).digest('hex');

// Displayed risk/reward (§1.2 `computed`) — display arithmetic only, matches trade_calc.risk_reward. Never used to size.
function riskReward(side, entryDec, stopDec, targetDec) {
  const risk = entryDec > stopDec ? entryDec - stopDec : stopDec - entryDec;
  let reward = null, ratio = null;
  if (targetDec != null) {
    reward = targetDec > entryDec ? targetDec - entryDec : entryDec - targetDec;
    ratio = risk > 0n ? format(reward * SCALE / risk) : null;
  }
  return { risk: format(risk), reward: reward != null ? format(reward) : null, ratio, note: 'display only; not used to size' };
}

// ---- PURE candle evaluator (§3.6 candle_adverse; used for outage reconciliation over 1m candles) ----
// bracket.side is the POSITION side: 'buy' (long) / 'sell' (short). bar = {open,high,low,close}.
export function evaluateBar(bracket, bar, { slippage_bps = 0 } = {}) {
  const long = bracket.side === 'buy';
  const stop = dec(bracket.stop), target = bracket.target != null ? dec(bracket.target) : null;
  const open = dec(bar.open), high = dec(bar.high), low = dec(bar.low);
  const slip = (px) => { if (!slippage_bps) return px; const adj = px * BigInt(Math.round(slippage_bps)) / 10000n; return long ? px - adj : px + adj; };
  const stopTouched = long ? low <= stop : high >= stop;
  const targetTouched = target != null && (long ? high >= target : low <= target);
  if (!stopTouched && !targetTouched) return { leg: null, fill_price: null, reason: 'no_touch', resolution_basis: null, both_touched: false, gap: false };
  const both = stopTouched && targetTouched;
  if (both || stopTouched) {
    // Gap rule: if the candle OPENED beyond the stop, fill = open (adverse), not the level.
    const gapped = long ? open < stop : open > stop;
    let px = slip(gapped ? open : stop);
    return { leg: 'stop', fill_price: format(px), reason: both ? 'both_touched_stop_first' : gapped ? 'gap_through_stop' : 'stop_touched', resolution_basis: 'candle_adverse', both_touched: both, gap: gapped };
  }
  // Target only. Candle gap rule for target: if open beyond target, fill = open (still never better than target for the seller/buyer).
  const gapped = long ? open > target : open < target;
  const px = gapped ? open : target;
  return { leg: 'target', fill_price: format(px), reason: 'target_touched', resolution_basis: 'candle_adverse', both_touched: false, gap: gapped };
}

// ---- PURE snapshot evaluator (§3.4/§3.6 snapshot_adverse; the LIVE ticker/snapshot path) ----
// quote = { ref, bid, ask } — ref is the trigger_reference price (last|mark); fills use executable
// bid (closing a long SELLS at bid) / ask (closing a short BUYS at ask), NEVER `last`.
export function evaluateSnapshot(bracket, quote, { slippage_bps = 0 } = {}) {
  const long = bracket.side === 'buy';
  const stop = dec(bracket.stop), target = bracket.target != null ? dec(bracket.target) : null;
  const ref = dec(quote.ref), exec = long ? dec(quote.bid) : dec(quote.ask);
  const slip = (px) => { if (!slippage_bps) return px; const adj = px * BigInt(Math.round(slippage_bps)) / 10000n; return long ? px - adj : px + adj; };
  const stopHit = long ? ref <= stop : ref >= stop;
  const targetHit = target != null && (long ? ref >= target : ref <= target);
  if (stopHit) {
    // long stop fill = min(stop, bid); short = max(stop, ask). Then adverse slippage.
    const gap = long ? exec < stop : exec > stop;
    const px = slip(long ? (exec < stop ? exec : stop) : (exec > stop ? exec : stop));
    return { leg: 'stop', fill_price: format(px), reason: gap ? 'gap_beyond_stop' : 'stop_touched', resolution_basis: 'snapshot_adverse', both_touched: targetHit, gap };
  }
  if (targetHit) {
    // long target fill = min(target, bid); short = max(target, ask). Never better than target.
    const gap = long ? exec < target : exec > target;
    const px = long ? (exec < target ? exec : target) : (exec > target ? exec : target);
    return { leg: 'target', fill_price: format(px), reason: 'target_touched', resolution_basis: 'snapshot_adverse', both_touched: false, gap };
  }
  return { leg: null, fill_price: null, reason: 'no_touch', resolution_basis: null, both_touched: false, gap: false };
}

// ---- freshness / admissibility gate (§3.1/§3.2; mirrors the ledger BloFin quote contract) ----
function assessQuote(feed, symbol, now) {
  const r = feed?.rows?.find(x => x.symbol === symbol);
  const okFeed = feed?.source === 'blofin_public' && feed.instrument_class === 'crypto_perp' && feed.state === 'fresh' && Number.isFinite(feed.ttl_seconds) && feed.ttl_seconds > 0;
  const stamp = Date.parse(feed?.generated_at);
  if (!okFeed || !r || r.state !== 'fresh') return { ok: false, reason: 'approved_perp_data_unavailable', row: r || null, source: feed?.source || null };
  const rowAge = Number.isFinite(r.observed_at_ms) ? now - r.observed_at_ms : Infinity;
  const feedAge = Number.isFinite(stamp) ? now - stamp : Infinity;
  if (feedAge < 0 || feedAge > feed.ttl_seconds * 1000 || rowAge < 0 || rowAge > feed.ttl_seconds * 1000) return { ok: false, reason: 'market_data_stale', row: r, source: feed.source, observed_age_ms: rowAge, feed_ts: r.observed_at_ms ?? null };
  const bid = r.exact?.bid ?? r.bid, ask = r.exact?.ask ?? r.ask, mark = r.exact?.mark ?? r.mark, last = r.exact?.last ?? r.last ?? mark;
  if (!(Number(bid) > 0) || !(Number(ask) > 0) || Number(bid) > Number(ask)) return { ok: false, reason: 'invalid_quote', row: r, source: feed.source };
  return { ok: true, row: r, source: feed.source, source_sha256: feed.source_sha256 ?? null, channel: feed.channel ?? 'tickers', bid: String(bid), ask: String(ask), mark: String(mark ?? bid), last: String(last ?? mark ?? bid), observed_age_ms: rowAge, feed_ts: r.observed_at_ms ?? null };
}
const refPrice = (qa, trigger_reference) => trigger_reference === 'mark' ? qa.mark : qa.last;

// ---- §3.8 PURE FOLD: events (seq order) → bracket state. No state exists outside this fold. ----
function foldTrade(events) {
  let b = null;
  for (const e of events) {
    const p = e.payload || {};
    switch (e.event) {
      case 'proposal_created':
        b = { ...p, trade_id: e.trade_ref, trade_ref: e.trade_ref, bracket_id: e.bracket_id, owner: e.owner, state: 'proposed', created_at: iso(e.recv_ts), confirmed_at: null, last_check_ms: null, observed_data_age_ms: null, quote_source: null, last_outcome: null, prev_feed_ts: null, triggered: null };
        break;
      case 'proposal_expired': if (b && b.state === 'proposed') b.state = 'unprotected'; break;
      case 'levels_confirmed': if (b) { b.state = 'active'; b.stop = p.stop; b.target = p.target ?? null; b.trigger_reference = p.trigger_reference; b.confirmed_at = iso(e.recv_ts); } break;
      case 'observation_admitted': if (b) { b.last_check_ms = e.recv_ts; b.observed_data_age_ms = p.observed_data_age_ms ?? null; b.quote_source = p.quote_source ?? null; b.last_outcome = p.outcome ?? null; if (p.feed_ts != null) b.prev_feed_ts = p.feed_ts; } break;
      case 'stale_entered': if (b) { b.state = 'stale_unmanaged'; b.stale_reason = p.reason; b.last_check_ms = e.recv_ts; b.observed_data_age_ms = p.observed_data_age_ms ?? b.observed_data_age_ms; b.quote_source = p.quote_source ?? b.quote_source; } break;
      case 'stale_exited': if (b) { b.state = 'active'; b.stale_reason = null; } break;
      case 'reconcile_started': if (b) b.state = 'reconciling'; break;
      case 'reconcile_finished': if (b) b.state = p.state; break;
      case 'leg_triggered': if (b) { b.state = 'triggered'; b.triggered = { leg: p.leg, reason: p.reason, resolution_basis: p.resolution_basis, observation_id: p.observation_id, both_touched: p.both_touched ?? false, gap: p.gap ?? false, at: iso(e.recv_ts), quote_source: p.quote_source ?? null, observed_age_ms: p.observed_age_ms ?? null, fill_price: null, sibling_cancelled: null }; } break;
      case 'sibling_cancelled': if (b && b.triggered) b.triggered.sibling_cancelled = p.leg; break;
      case 'fill_written': if (b && b.triggered) { b.triggered.fill_price = p.fill_price; b.triggered.gap = p.gap ?? b.triggered.gap; b.state = p.leg === 'stop' ? 'closed_stop' : 'closed_target'; } break;
      case 'manual_close': if (b) { b.state = 'closed_manual'; b.closed_fill = p.fill_price ?? null; } break;
      case 'manual_cancel': if (b) b.state = 'unprotected'; break;
      case 'quantity_reduced': if (b) b.quantity = p.quantity; break;
      default: break;
    }
  }
  return b;
}

// ---- stateful engine -----------------------------------------------------------------------
export function createPaperManagement({ filename, now = Date.now, slippage_bps = OPERATIONAL_CONSTANTS.slippage_bps_default, proposal_ttl_ms = OPERATIONAL_CONSTANTS.proposal_ttl_ms } = {}) {
  if (!filename) fail('explicit_store_path_required', 500);
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;'
    + 'CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE, owner TEXT, trade_ref TEXT, bracket_id TEXT, event TEXT, actor TEXT, recv_ts INTEGER, feed_ts INTEGER, payload TEXT, prev_hash TEXT, hash TEXT);'
    + 'CREATE INDEX IF NOT EXISTS events_trade ON events (trade_ref, seq);'
    + 'CREATE TABLE IF NOT EXISTS state_cache (trade_ref TEXT PRIMARY KEY, owner TEXT, data TEXT NOT NULL);'
    + 'CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, result TEXT NOT NULL);');

  const qEventsForTrade = db.prepare('SELECT event, actor, recv_ts, feed_ts, event_id, trade_ref, bracket_id, owner, payload FROM events WHERE trade_ref=? ORDER BY seq');
  const qAllEvents = db.prepare('SELECT event, actor, recv_ts, feed_ts, event_id, trade_ref, bracket_id, owner, payload FROM events ORDER BY seq');
  const qLastHashOwner = db.prepare('SELECT hash FROM events WHERE owner=? ORDER BY seq DESC LIMIT 1');
  const qHasTrigObs = db.prepare("SELECT 1 FROM events WHERE bracket_id=? AND event='leg_triggered' AND json_extract(payload,'$.observation_id')=? LIMIT 1");
  const insEvent = db.prepare('INSERT INTO events (event_id,owner,trade_ref,bracket_id,event,actor,recv_ts,feed_ts,payload,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const putCache = db.prepare('INSERT INTO state_cache (trade_ref,owner,data) VALUES (?,?,?) ON CONFLICT(trade_ref) DO UPDATE SET data=excluded.data,owner=excluded.owner');
  const getCache = db.prepare('SELECT data FROM state_cache WHERE trade_ref=?');
  const allCache = db.prepare('SELECT data FROM state_cache');
  const delCacheAll = db.prepare('DELETE FROM state_cache');
  const distinctTrades = db.prepare('SELECT DISTINCT trade_ref FROM events');
  const getReq = db.prepare('SELECT result FROM requests WHERE key=?');
  const putReq = db.prepare('INSERT OR IGNORE INTO requests (key,result) VALUES (?,?)');
  const GENESIS = '0'.repeat(64);

  const eventsForTrade = (tr) => qEventsForTrade.all(tr).map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  const foldFromLog = (tr) => foldTrade(eventsForTrade(tr));
  // Append a hash-chained event (per-owner ledger chain), then re-materialize the trade's cache from the fold.
  function append(owner, trade_ref, bracket_id, event, actor, recv_ts, feed_ts, payload) {
    const prev = qLastHashOwner.get(owner)?.hash ?? GENESIS;
    const event_id = randomUUID();
    const core = { event_id, owner, trade_ref, bracket_id, event, actor, recv_ts, feed_ts: feed_ts ?? null, payload };
    const hash = createHash('sha256').update(prev + canonical(core)).digest('hex');
    insEvent.run(event_id, owner, trade_ref, bracket_id, event, actor, recv_ts, feed_ts ?? null, JSON.stringify(payload), prev, hash);
    return { event_id, hash };
  }
  const recache = (tr) => { const b = foldFromLog(tr); if (b) putCache.run(tr, b.owner, JSON.stringify(b)); return b; };
  const loadCache = (tr) => { const r = getCache.get(tr); return r ? JSON.parse(r.data) : null; };

  // Serialize a mutation with idempotency (§3.5). fn runs INSIDE BEGIN IMMEDIATE.
  function mutate(requestKey, hashInput, fn) {
    if (requestKey != null && (typeof requestKey !== 'string' || !/^[-a-zA-Z0-9_]{6,128}$/.test(requestKey))) fail('idempotency_key_invalid', 400);
    const hash = fingerprint(hashInput);
    db.exec('BEGIN IMMEDIATE');
    let committed = false;
    try {
      if (requestKey) {
        const prior = getReq.get(requestKey);
        if (prior) { const p = JSON.parse(prior.result); db.exec('COMMIT'); committed = true; if (p.__hash !== hash) fail('idempotency_conflict', 409); return { ...p.value, duplicate: true }; }
      }
      const value = fn();
      if (requestKey) putReq.run(requestKey, JSON.stringify({ __hash: hash, value }));
      db.exec('COMMIT'); committed = true;
      return { ...value, duplicate: false };
    } catch (e) { if (!committed) db.exec('ROLLBACK'); throw e; }
  }

  // §1.4 validation shared by propose + confirm. Rounds prices toward entry (conservative) and runs
  // direction / would_trigger_immediately / freshness / live-catalog against a REQUIRED live quote.
  function validateLevels({ side, entryDec, stopDec, targetDec, tickDec, quote, symbol }) {
    if (!quote) fail('quote_required', 400, 'a live quote (feed) is required to validate would-trigger-immediately + freshness (§1.4)');
    const qa = assessQuote(quote, symbol, now());
    if (!qa.ok) fail('quote_stale', 422, qa.reason);
    const bid = dec(qa.bid), ask = dec(qa.ask);
    const long = side === 'buy';
    // Conservative rounding toward entry (§1.4), disclosed by the caller.
    const stop = roundTowardEntry(stopDec, entryDec, tickDec);
    const target = targetDec != null ? roundTowardEntry(targetDec, entryDec, tickDec) : null;
    // Direction (§1.4).
    if (long ? !(stop < entryDec && (target == null || entryDec < target)) : !(stop > entryDec && (target == null || entryDec > target)))
      fail('direction_invalid', 400, long ? 'long requires stop < entry < target' : 'short requires stop > entry > target');
    // would_trigger_immediately (§1.4): long stop<bid and (target?) target>ask; short mirrored.
    const wti = long ? !(stop < bid && (target == null || target > ask)) : !(stop > ask && (target == null || target < bid));
    if (wti) fail('would_trigger_immediately', 422, 'level already on the wrong side of the current quote — close manually or re-price');
    return { stop, target, qa };
  }

  const engine = {
    live_mode: false,
    close() { db.close(); },
    get operationalConstants() { return { ...OPERATIONAL_CONSTANTS, proposal_ttl_ms, slippage_bps }; },

    // §1.2 Proposal. Levels are CONFIRMED caller values (QUANT-derived or user-entered) — never invented.
    // A live `quote` (feed) is REQUIRED (§1.4 would_trigger_immediately + freshness).
    propose({ trade_id, owner, symbol, side, quantity, entry, stop, target, trigger_reference = OPERATIONAL_CONSTANTS.trigger_reference_default, derivation, strategy = {}, catalog, quote, requestKey }) {
      assertPaperOnly(arguments[0]);
      if (!trade_id || !owner || !symbol) fail('missing_fields', 400);
      if (!['buy', 'sell'].includes(side)) fail('invalid_side', 400);
      if (!['last', 'mark'].includes(trigger_reference)) fail('invalid_trigger_reference', 400);
      const q = dec(quantity); if (!isLotAligned(q)) fail('quantity_precision', 400);
      const e = dec(entry), s = dec(stop), t = target == null ? null : dec(target); // target optional (§1.2)
      if (s <= 0n || e <= 0n || (t != null && t <= 0n)) fail('invalid_values', 400);
      if (!catalog || catalog.tick == null || catalog.lot == null) fail('catalog_required', 400, 'BloFin tick/lot required to validate precision; not fabricated.');
      if (catalog.state !== 'live') fail('instrument_unverified', 422, 'catalog state must be live (§1.4 instrument/class check)');
      const tick = dec(catalog.tick), lot = dec(catalog.lot);
      if (lot <= 0n || q % lot !== 0n) fail('lot_precision', 400, `quantity not a multiple of lot ${format(lot)}`);
      const { stop: sr, target: tr2, qa } = validateLevels({ side, entryDec: e, stopDec: s, targetDec: t, tickDec: tick, quote, symbol });
      const rounded = (sr !== s) || (t != null && tr2 !== t);

      return mutate(requestKey, { op: 'propose', trade_id, side, stop: format(sr), target: tr2 != null ? format(tr2) : null, quantity: format(q) }, () => {
        if (foldFromLog(trade_id)) fail('bracket_exists', 409);
        const bracket_id = randomUUID();
        const disclosures = [
          'Simulated stop is NOT a guaranteed exact fill — fills use the executable bid/ask, gap and slippage modelled (§3.4).',
          OPERATIONAL_CONSTANTS.fees_note + '.',
          OPERATIONAL_CONSTANTS.funding_note + ' (perp).',
          `slippage: ${slippage_bps ? slippage_bps + ' bps (adverse only)' : OPERATIONAL_CONSTANTS.slippage_note}.`,
          `trigger reference: ${trigger_reference}.`,
          OPERATIONAL_CONSTANTS.measured_observation + '.',
        ];
        if (rounded) disclosures.push(`prices rounded to tick toward entry (conservative): stop ${format(s)}→${format(sr)}${t != null ? `, target ${format(t)}→${format(tr2)}` : ''}.`);
        const payload = {
          symbol, side, quantity: format(q), entry_ref: format(e), stop: format(sr), target: tr2 != null ? format(tr2) : null,
          trigger_reference, derivation: derivation === 'user_entered' || derivation === 'strategy' ? derivation : (strategy && strategy.name ? 'strategy' : 'user_entered'),
          computed: riskReward(side, e, sr, tr2),
          strategy: { name: strategy.name ?? 'UNKNOWN', version: strategy.version ?? 'UNKNOWN', hash: strategy.hash ?? 'UNKNOWN' },
          status_label: strategy.status_label ?? null,
          catalog: { tick: format(tick), lot: format(lot), state: catalog.state },
          validity: { ttl_ms: proposal_ttl_ms, expires_at: iso(now() + proposal_ttl_ms), quote_ref: { bid: qa.bid, ask: qa.ask, feed_ts: qa.feed_ts } },
          slippage_bps, fees_funding_modeled: false, disclosures,
        };
        append(owner, trade_id, bracket_id, 'proposal_created', `user:${owner}`, now(), qa.feed_ts, payload);
        const b = recache(trade_id);
        return { bracket: b, live_mode: false };
      });
    },

    // §1.3 Confirmation: explicit user action carrying the exact levels moves proposed → active.
    // Re-validates against a fresh REQUIRED quote (§1.4). Idempotent.
    confirm({ trade_id, owner, quote, requestKey }) {
      return mutate(requestKey, { op: 'confirm', trade_id }, () => {
        const b = foldFromLog(trade_id); if (!b) fail('bracket_not_found', 404); if (b.owner !== owner) fail('not_owner', 403);
        if (b.state === 'active') return { bracket: b, live_mode: false };
        if (b.state !== 'proposed') fail('not_confirmable', 409, `state ${b.state}`);
        // TTL expiry (§1.2 validity).
        if (b.validity?.expires_at && Date.parse(b.validity.expires_at) <= now()) {
          append(owner, trade_id, b.bracket_id, 'proposal_expired', 'engine', now(), null, { reason: 'ttl' });
          const nb = recache(trade_id); fail('proposal_expired', 409, `state ${nb.state}`);
        }
        // Re-validate would_trigger_immediately + freshness at confirm.
        validateLevels({ side: b.side, entryDec: dec(b.entry_ref), stopDec: dec(b.stop), targetDec: b.target != null ? dec(b.target) : null, tickDec: dec(b.catalog.tick), quote, symbol: b.symbol });
        append(owner, trade_id, b.bracket_id, 'levels_confirmed', `user:${owner}`, now(), null, { stop: b.stop, target: b.target, trigger_reference: b.trigger_reference });
        const nb = recache(trade_id);
        return { bracket: nb, live_mode: false };
      });
    },

    // Manual cancel of the protective bracket: removes protection, position remains → unprotected (§1.1).
    // Races with a fill: if already triggered/terminal, no-op conflict (mirrors BloFin amend-failure).
    cancel({ trade_id, owner, requestKey }) {
      return mutate(requestKey, { op: 'cancel', trade_id }, () => {
        const b = foldFromLog(trade_id); if (!b) fail('bracket_not_found', 404); if (b.owner !== owner) fail('not_owner', 403);
        if (b.state === 'triggered' || TERMINAL.has(b.state)) fail('already_resolved', 409, `state ${b.state}`);
        if (b.state === 'unprotected') return { bracket: b, live_mode: false };
        append(owner, trade_id, b.bracket_id, 'manual_cancel', `user:${owner}`, now(), null, {});
        return { bracket: recache(trade_id), live_mode: false };
      });
    },

    // §1.5 Manual close of the position (reduce-only) → closed_manual. Races with a trigger by recv_ts.
    closePosition({ trade_id, owner, fill_price = null, reducePosition, requestKey }) {
      return mutate(requestKey, { op: 'close', trade_id }, () => {
        const b = foldFromLog(trade_id); if (!b) fail('bracket_not_found', 404); if (b.owner !== owner) fail('not_owner', 403);
        if (b.state === 'triggered' || TERMINAL.has(b.state)) fail('already_resolved', 409, `state ${b.state}`);
        let reduce = null;
        if (typeof reducePosition === 'function') reduce = reducePosition({ trade_id, owner, symbol: b.symbol, side: b.side, quantity: b.quantity, price: fill_price, leg: 'manual' });
        append(owner, trade_id, b.bracket_id, 'manual_close', `user:${owner}`, now(), null, { fill_price });
        return { bracket: recache(trade_id), reduce, live_mode: false };
      });
    },

    // §1.5 reduce-only quantity clamp: bracket qty follows a manual position reduction; never flips/exceeds.
    reduceQuantity({ trade_id, owner, position_quantity, requestKey }) {
      return mutate(requestKey, { op: 'reduce', trade_id, position_quantity }, () => {
        const b = foldFromLog(trade_id); if (!b) fail('bracket_not_found', 404); if (b.owner !== owner) fail('not_owner', 403);
        if (!['active', 'stale_unmanaged', 'reconciling'].includes(b.state)) fail('not_reducible', 409, `state ${b.state}`);
        const pq = dec(position_quantity); if (pq < 0n) fail('invalid_values', 400);
        const cur = dec(b.quantity);
        const clamped = pq < cur ? pq : cur; // min(leg_qty, position_qty) — never increases
        if (clamped === cur) return { bracket: b, live_mode: false };
        append(owner, trade_id, b.bracket_id, 'quantity_reduced', `user:${owner}`, now(), null, { quantity: format(clamped), from: b.quantity });
        return { bracket: recache(trade_id), live_mode: false };
      });
    },

    // §3.4/§3.5 Observe a feed and enforce every active bracket. Stale/invalid → pause+alert (no mutation).
    // Trigger detection on trigger_reference; fill on executable bid/ask. Idempotent by (bracket_id, obs_id).
    onObservation({ owner, feed, reducePosition } = {}) {
      const alerts = []; const events = [];
      const rows = allCache.all().map(r => JSON.parse(r.data)).filter(b => (!owner || b.owner === owner) && b.state === 'active');
      for (const b of rows) {
        const qa = assessQuote(feed, b.symbol, now());
        try {
          const out = mutate(null, null, () => {
            const cur = foldFromLog(b.trade_id);
            if (!cur || cur.state !== 'active') return { skipped: true };
            if (!qa.ok) {
              append(cur.owner, cur.trade_id, cur.bracket_id, 'stale_entered', 'engine', now(), qa.feed_ts, { reason: qa.reason, quote_source: qa.source, observed_data_age_ms: qa.observed_age_ms ?? null });
              return { paused: true, reason: qa.reason, bracket: recache(cur.trade_id) };
            }
            // §3.1 admissibility: feed_ts must not be older than the last admitted observation.
            if (cur.prev_feed_ts != null && qa.feed_ts != null && qa.feed_ts < cur.prev_feed_ts) {
              return { held: true, out_of_order: true };
            }
            const obs_id = `${b.symbol}:${qa.feed_ts}`;
            const ref = refPrice(qa, cur.trigger_reference);
            const decision = evaluateSnapshot(cur, { ref, bid: qa.bid, ask: qa.ask }, { slippage_bps: cur.slippage_bps });
            append(cur.owner, cur.trade_id, cur.bracket_id, 'observation_admitted', 'engine', now(), qa.feed_ts,
              { feed_ts: qa.feed_ts, quote_source: qa.source, channel: qa.channel, observed_data_age_ms: qa.observed_age_ms, outcome: decision.leg ? 'triggered' : 'no_trigger' });
            if (!decision.leg) { return { held: true, bracket: recache(cur.trade_id) }; }
            // Idempotency (§3.5): duplicate WS delivery of the same observation is a no-op.
            if (qHasTrigObs.get(cur.bracket_id, obs_id)) return { held: true, duplicate_obs: true, bracket: recache(cur.trade_id) };
            const sibling = decision.leg === 'stop' ? 'target' : 'stop';
            // Atomic trigger txn: leg_triggered → sibling_cancelled → fill_written → closed_* (§3.5).
            append(cur.owner, cur.trade_id, cur.bracket_id, 'leg_triggered', 'engine', now(), qa.feed_ts,
              { leg: decision.leg, reason: decision.reason, resolution_basis: decision.resolution_basis, observation_id: obs_id, both_touched: decision.both_touched, gap: decision.gap, quote_source: qa.source, observed_age_ms: qa.observed_age_ms });
            if (cur.target != null) append(cur.owner, cur.trade_id, cur.bracket_id, 'sibling_cancelled', 'engine', now(), qa.feed_ts, { leg: sibling });
            let reduce = null;
            if (typeof reducePosition === 'function') reduce = reducePosition({ trade_id: cur.trade_id, owner: cur.owner, symbol: cur.symbol, side: cur.side, quantity: cur.quantity, price: decision.fill_price, leg: decision.leg });
            append(cur.owner, cur.trade_id, cur.bracket_id, 'fill_written', 'engine', now(), qa.feed_ts, { leg: decision.leg, fill_price: decision.fill_price, gap: decision.gap, resolution_basis: decision.resolution_basis });
            return { triggered: true, leg: decision.leg, fill_price: decision.fill_price, reason: decision.reason, resolution_basis: decision.resolution_basis, reduce, bracket: recache(cur.trade_id) };
          });
          if (out.paused) alerts.push({ trade_id: b.trade_id, reason: out.reason });
          if (out.triggered) events.push({ trade_id: b.trade_id, leg: out.leg, fill_price: out.fill_price, reason: out.reason, resolution_basis: out.resolution_basis });
        } catch (e) { alerts.push({ trade_id: b.trade_id, reason: e.code || 'engine_error' }); }
      }
      return { alerts, events, live_mode: false };
    },

    // §3.3 restart/outage reconciliation → reconciling: recompute state from the log (intrinsic to the
    // fold), evaluate any provided gap candles with the candle rule (stop-first, §3.6), then resume.
    // Live BloFin REST candle fetch is the production feed binding (GATED by freeze; supply gapCandles here).
    reconcile({ owner, feed, gapCandles = {} } = {}) {
      const reconciled = [];
      const rows = allCache.all().map(r => JSON.parse(r.data)).filter(b => (!owner || b.owner === owner) && ['active', 'stale_unmanaged'].includes(b.state));
      for (const b of rows) {
        const qa = assessQuote(feed, b.symbol, now());
        mutate(null, null, () => {
          let cur = foldFromLog(b.trade_id); if (!cur) return {};
          append(cur.owner, cur.trade_id, cur.bracket_id, 'reconcile_started', 'engine', now(), null, {});
          recache(cur.trade_id);
          // Gap-candle evaluation (§3.3.2d): idempotent by (bracket_id, candle_ts).
          const candles = gapCandles[cur.symbol] || [];
          let closedByGap = false;
          for (const c of candles) {
            const obs_id = `candle:${c.ts}`;
            if (qHasTrigObs.get(cur.bracket_id, obs_id)) { if (TERMINAL.has(foldFromLog(cur.trade_id)?.state)) { closedByGap = true; } continue; }
            const d = evaluateBar(cur, c, { slippage_bps: cur.slippage_bps });
            if (d.leg) {
              const sibling = d.leg === 'stop' ? 'target' : 'stop';
              append(cur.owner, cur.trade_id, cur.bracket_id, 'leg_triggered', 'engine', now(), c.ts, { leg: d.leg, reason: d.reason, resolution_basis: d.resolution_basis, resolution_source: 'outage_candles', observation_id: obs_id, both_touched: d.both_touched, gap: d.gap });
              if (cur.target != null) append(cur.owner, cur.trade_id, cur.bracket_id, 'sibling_cancelled', 'engine', now(), c.ts, { leg: sibling });
              append(cur.owner, cur.trade_id, cur.bracket_id, 'fill_written', 'engine', now(), c.ts, { leg: d.leg, fill_price: d.fill_price, gap: d.gap, resolution_basis: d.resolution_basis });
              closedByGap = true; break;
            }
          }
          cur = foldFromLog(cur.trade_id);
          if (!closedByGap && !TERMINAL.has(cur.state)) {
            const finalState = qa.ok ? 'active' : 'stale_unmanaged';
            append(cur.owner, cur.trade_id, cur.bracket_id, 'reconcile_finished', 'engine', now(), qa.feed_ts, { state: finalState, reason: qa.ok ? null : qa.reason });
          }
          const nb = recache(cur.trade_id);
          reconciled.push({ trade_id: nb.trade_id, state: nb.state });
          return {};
        });
      }
      return { reconciled, live_mode: false };
    },

    // §3.8 rebuild the materialized cache purely from the event log — proves state is a pure fold.
    rebuild() {
      return mutate(null, null, () => {
        delCacheAll.run();
        let n = 0;
        for (const { trade_ref } of distinctTrades.all()) { const b = foldFromLog(trade_ref); if (b) { putCache.run(trade_ref, b.owner, JSON.stringify(b)); n++; } }
        return { rebuilt: n };
      });
    },

    // Verify the per-owner hash chain (tamper-evidence). Returns {ok, checked, brokenAt?}.
    verifyChain({ owner } = {}) {
      const all = qAllEvents.all().map(r => ({ ...r, payload: JSON.parse(r.payload) })).filter(e => !owner || e.owner === owner);
      const lastByOwner = new Map();
      for (const e of all) {
        const prev = lastByOwner.get(e.owner) ?? GENESIS;
        const core = { event_id: e.event_id, owner: e.owner, trade_ref: e.trade_ref, bracket_id: e.bracket_id, event: e.event, actor: e.actor, recv_ts: e.recv_ts, feed_ts: e.feed_ts ?? null, payload: e.payload };
        const hash = createHash('sha256').update(prev + canonical(core)).digest('hex');
        const row = db.prepare('SELECT hash, prev_hash FROM events WHERE event_id=?').get(e.event_id);
        if (row.prev_hash !== prev || row.hash !== hash) return { ok: false, checked: all.length, brokenAt: e.event_id };
        lastByOwner.set(e.owner, row.hash);
      }
      return { ok: true, checked: all.length };
    },

    get(trade_id) { const b = loadCache(trade_id) || foldFromLog(trade_id); if (!b) fail('bracket_not_found', 404); return b; },
    list({ owner } = {}) { return { brackets: allCache.all().map(r => JSON.parse(r.data)).filter(b => !owner || b.owner === owner), live_mode: false, operational_constants: this.operationalConstants }; },

    // §2 honest enrollment: positions with no confirmed/proposed bracket are unprotected/needs-levels.
    listUnprotected(positions = [], { owner } = {}) {
      const managed = new Set(allCache.all().map(r => JSON.parse(r.data)).filter(b => ['proposed', 'active', 'triggered'].includes(b.state)).map(b => b.trade_id));
      return positions
        .filter(p => (!owner || p.owner === owner) && !managed.has(p.id ?? p.trade_id))
        .map(p => ({ trade_id: p.id ?? p.trade_id, symbol: p.symbol, side: p.side, quantity: p.quantity, state: 'unprotected', note: 'unprotected / needs levels — supply or confirm protective levels; never retro-assigned.' }));
    },

    // §3.8 audit trail = the event log itself (append-only, hash-chained), newest first.
    auditTrail({ limit = 200, owner } = {}) {
      let rows = qAllEvents.all().map(r => ({ ...r, payload: JSON.parse(r.payload) }));
      if (owner) rows = rows.filter(e => e.owner === owner);
      return rows.slice(-limit).reverse().map(e => ({ event: e.event, actor: e.actor, trade_id: e.trade_ref, bracket_id: e.bracket_id, at: iso(e.recv_ts), feed_ts: e.feed_ts ?? null, hash: e.hash, ...e.payload }));
    },
  };
  return engine;
}
