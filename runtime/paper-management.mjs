// Deterministic PAPER trade-protection engine (PART C, directive 20260912-160705).
// Implements PAPER-MANAGEMENT-CONTRACT-20260912 §3 (manager states & semantics) and §6 (tests).
//
// HARD BOUNDARIES (contract §0 — non-negotiable):
//   - PAPER ONLY. No broker, no account, no network, no live order endpoint. There is NO code path
//     from this module to a real order. Global LIVE_MODE / real-money hard denial stays intact:
//     any live/real flag on an input is refused outright (assertPaperOnly).
//   - This engine is deterministic CODE, not the LLM. QUANT is NOT in the per-tick path; QUANT
//     authors/derives levels (§1) upstream — this engine only ENFORCES already-CONFIRMED levels.
//   - It does NOT autonomously open positions, widen stops, add leverage/size, or change targets.
//     Trailing/breakeven/dynamic is NOT authorized (§4): confirmed static levels only.
//   - Existing trades are never retro-assigned protection; they are listed unprotected/needs-levels.
//
// Determinism & safety:
//   - Exact fixed-point (paper-decimal, scale-12) level math — never float compares.
//   - SQLite BEGIN IMMEDIATE serializes every mutation (atomic vs manual cancel/close/partial-fill
//     races) and persists brackets so they survive restart; reconcile() re-checks before resuming.
//   - Idempotent mutations (requestKey). Sibling-cancel-on-fill is intrinsic: a bracket is ONE OCO
//     record; one leg triggering atomically closes the record and cancels the sibling.
//   - Conservative trigger semantics: a stop is NOT a guaranteed exact fill (gap/slippage modeled);
//     both-touched-in-one-bar resolves stop-first (adverse) — never an optimistic fabricated fill.
//   - Stale/invalid data → pause automatic simulated mutations, mark stale/unmanaged, alert.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { parse, format } from './paper-decimal.mjs';

export class ManagementError extends Error { constructor(code, status = 422, detail) { super(code); this.code = code; this.status = status; this.detail = detail || null; } }
const fail = (c, s = 422, d) => { throw new ManagementError(c, s, d); };

export const MANAGER_STATES = Object.freeze(['unprotected', 'proposed', 'confirmed/active', 'triggered', 'closed', 'stale/unmanaged', 'cancelled']);
const LIVE_FORBIDDEN = ['live', 'live_mode', 'real', 'real_money', 'broker', 'endpoint', 'api_key', 'account'];

// Any hint of a live/real order path is refused. This engine has no such path and never will.
function assertPaperOnly(obj) {
  if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) {
    if (LIVE_FORBIDDEN.includes(k.toLowerCase()) && obj[k]) fail('live_mode_denied', 403, `Field '${k}' is refused: this engine is PAPER-ONLY and exposes no real-order path.`);
  }
}

const dec = (x) => { try { return parse(x); } catch { fail('invalid_decimal', 400, `not a decimal: ${x}`); } };
// Quantity precision: scale-12 fixed point, lot = 1e-8 (matches paper-simulation qty rule n%10000n).
const isLotAligned = (n) => n > 0n && n % 10000n === 0n;

// Validate a price sits on the catalog tick grid (exact fixed-point remainder).
function onTick(valueDec, tickDec) { return tickDec > 0n && valueDec > 0n && valueDec % tickDec === 0n; }

const canonical = (x) => x === null || typeof x !== 'object' ? JSON.stringify(x) : Array.isArray(x) ? '[' + x.map(canonical).join(',') + ']' : '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
const fingerprint = (x) => createHash('sha256').update(canonical(x)).digest('hex');

// ---- PURE deterministic trigger core (the heart of §3 trigger semantics) -------------------
//
// bracket.side is the POSITION side: 'buy' (long) or 'sell' (short). Closing a long SELLS; closing
// a short BUYS. bar = { open, high, low, close } as decimal strings for the observation window.
// Returns { leg:'stop'|'target'|null, fill_price, reason, both_touched, gap } — all decisions
// conservative and documented. NEVER an optimistic fill.
export function evaluateBar(bracket, bar, { slippage_bps = 0 } = {}) {
  const long = bracket.side === 'buy';
  const stop = dec(bracket.stop), target = dec(bracket.target);
  const open = dec(bar.open), high = dec(bar.high), low = dec(bar.low);
  // slippage applied ADVERSELY to a stop fill only (never improves a fill).
  const slip = (px) => {
    if (!slippage_bps) return px;
    const adj = px * BigInt(Math.round(slippage_bps)) / 10000n;
    return long ? px - adj : px + adj; // long stop sells lower; short stop buys higher
  };
  const stopTouched = long ? low <= stop : high >= stop;
  const targetTouched = long ? high >= target : low <= target;

  if (!stopTouched && !targetTouched) return { leg: null, fill_price: null, reason: 'no_touch', both_touched: false, gap: false };

  const both = stopTouched && targetTouched;
  // CONSERVATIVE: both touched in one bar → assume the adverse (stop) filled first. Documented.
  if (both || stopTouched) {
    // Gap-through: if the bar OPENED beyond the stop, the fill is at the (worse) open, not the stop.
    const gapped = long ? open < stop : open > stop;
    let px = gapped ? open : stop;
    px = slip(px);
    return {
      leg: 'stop', fill_price: format(px),
      reason: both ? 'both_touched_stop_first_conservative' : gapped ? 'gap_through_stop' : 'stop_touched',
      both_touched: both, gap: gapped,
    };
  }
  // Target only. A limit target fills AT the target (we do not claim a better gapped fill).
  return { leg: 'target', fill_price: format(target), reason: 'target_touched', both_touched: false, gap: false };
}

// PURE two-mark conservative evaluator for the LIVE poll path. Unlike evaluateBar (which is given a
// real OHLC candle), between two polls we have only prev/cur marks and NO intra-poll path. We must
// not claim a clean fill exactly at the stop — that is optimistic and unprovable. So a stop fill is
// the WORSE of {stop, current mark}: if the mark overshot the stop, that overshoot is the fill (a
// poll-gap behaves like a price gap). A favorable target fills AT the target (never a gifted better
// price). prevMark for an ACTIVE bracket is always between stop and target, so a single poll move
// can cross at most one boundary — both-touched cannot arise here (that is a real-candle case).
export function evaluateMarks(bracket, prevMark, curMark, { slippage_bps = 0 } = {}) {
  const long = bracket.side === 'buy';
  const stop = dec(bracket.stop), target = dec(bracket.target), cur = dec(curMark);
  const slip = (px) => { if (!slippage_bps) return px; const adj = px * BigInt(Math.round(slippage_bps)) / 10000n; return long ? px - adj : px + adj; };
  const stopHit = long ? cur <= stop : cur >= stop;
  const targetHit = long ? cur >= target : cur <= target;
  if (stopHit) { // adverse leg takes precedence
    const worse = long ? (cur < stop ? cur : stop) : (cur > stop ? cur : stop);
    const gapped = long ? cur < stop : cur > stop;
    return { leg: 'stop', fill_price: format(slip(worse)), reason: gapped ? 'gap_beyond_stop_conservative' : 'stop_touched', both_touched: false, gap: gapped };
  }
  if (targetHit) return { leg: 'target', fill_price: format(target), reason: 'target_touched', both_touched: false, gap: false };
  return { leg: null, fill_price: null, reason: 'no_touch', both_touched: false, gap: false };
}

// ---- freshness gate (mirrors the ledger's BloFin quote contract) ---------------------------
function assessQuote(feed, symbol, now) {
  const r = feed?.rows?.find(x => x.symbol === symbol);
  const okFeed = feed?.source === 'blofin_public' && feed.instrument_class === 'crypto_perp' && feed.state === 'fresh' && Number.isFinite(feed.ttl_seconds) && feed.ttl_seconds > 0;
  const stamp = Date.parse(feed?.generated_at);
  if (!okFeed || !r || r.state !== 'fresh') return { ok: false, reason: 'approved_perp_data_unavailable', row: r || null, source: feed?.source || null };
  const rowAge = Number.isFinite(r.observed_at_ms) ? now - r.observed_at_ms : Infinity;
  const feedAge = Number.isFinite(stamp) ? now - stamp : Infinity;
  if (feedAge < 0 || feedAge > feed.ttl_seconds * 1000 || rowAge < 0 || rowAge > feed.ttl_seconds * 1000) return { ok: false, reason: 'market_data_stale', row: r, source: feed.source, observed_age_ms: rowAge };
  const bid = r.exact?.bid ?? r.bid, ask = r.exact?.ask ?? r.ask, mark = r.exact?.mark ?? r.mark;
  if (!(Number(bid) > 0) || !(Number(ask) > 0) || Number(bid) > Number(ask)) return { ok: false, reason: 'invalid_quote', row: r, source: feed.source };
  return { ok: true, row: r, source: feed.source, source_sha256: feed.source_sha256 ?? null, bid: String(bid), ask: String(ask), mark: String(mark ?? bid), observed_age_ms: rowAge };
}

// ---- stateful engine -----------------------------------------------------------------------
export function createPaperManagement({ filename, now = Date.now, slippage_bps = 0 } = {}) {
  if (!filename) fail('explicit_store_path_required', 500);
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;'
    + 'CREATE TABLE IF NOT EXISTS brackets (trade_id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL);'
    + 'CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, data TEXT NOT NULL);'
    + 'CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, result TEXT NOT NULL);');

  const getRow = db.prepare('SELECT data FROM brackets WHERE trade_id=?');
  const putRow = db.prepare('INSERT INTO brackets (trade_id,owner,data) VALUES (?,?,?) ON CONFLICT(trade_id) DO UPDATE SET data=excluded.data');
  const allRows = db.prepare('SELECT data FROM brackets');
  const putAudit = db.prepare('INSERT INTO audit (at,data) VALUES (?,?)');
  const getReq = db.prepare('SELECT result FROM requests WHERE key=?');
  const putReq = db.prepare('INSERT OR IGNORE INTO requests (key,result) VALUES (?,?)');

  const load = (id) => { const r = getRow.get(id); return r ? JSON.parse(r.data) : null; };
  const save = (b) => putRow.run(b.trade_id, b.owner, JSON.stringify(b));
  const audit = (actor, event, b, extra = {}) => putAudit.run(now(), JSON.stringify({ actor, event, trade_id: b?.trade_id ?? null, state: b?.state ?? null, levels: b ? { stop: b.stop, target: b.target, quantity: b.quantity } : null, at: new Date(now()).toISOString(), ...extra }));

  // Serialize a mutation with idempotency. fn runs INSIDE BEGIN IMMEDIATE.
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

  const engine = {
    live_mode: false,
    close() { db.close(); },

    // §1 Proposal: validate direction + precision against BloFin catalog tick/lot. Levels are the
    // caller's CONFIRMED values (QUANT-derived or user-entered) — never invented here.
    propose({ trade_id, owner, symbol, side, quantity, entry, stop, target, strategy = {}, catalog, requestKey }) {
      assertPaperOnly(arguments[0]);
      if (!trade_id || !owner || !symbol) fail('missing_fields', 400);
      if (!['buy', 'sell'].includes(side)) fail('invalid_side', 400);
      const q = dec(quantity); if (!isLotAligned(q)) fail('quantity_precision', 400);
      const e = dec(entry), s = dec(stop), t = dec(target);
      if (s <= 0n || t <= 0n || e <= 0n) fail('invalid_values', 400);
      // Direction: long → stop below entry, target above; short → stop above, target below.
      if (side === 'buy' && !(s < e && e < t)) fail('invalid_long_bracket', 400, 'long requires stop < entry < target');
      if (side === 'sell' && !(s > e && e > t)) fail('invalid_short_bracket', 400, 'short requires stop > entry > target');
      if (!catalog || catalog.tick == null || catalog.lot == null) fail('catalog_required', 400, 'BloFin tick/lot required to validate precision; not fabricated.');
      const tick = dec(catalog.tick), lot = dec(catalog.lot);
      for (const [name, v] of [['entry', e], ['stop', s], ['target', t]]) if (!onTick(v, tick)) fail('tick_precision', 400, `${name} ${format(v)} not on tick ${format(tick)}`);
      if (lot <= 0n || q % lot !== 0n) fail('lot_precision', 400, `quantity not a multiple of lot ${format(lot)}`);

      return mutate(requestKey, { op: 'propose', trade_id, side, stop, target, quantity }, () => {
        if (load(trade_id)) fail('bracket_exists', 409);
        const b = {
          trade_id, owner, symbol, side, quantity: format(q), entry: format(e), stop: format(s), target: format(t),
          strategy: { name: strategy.name ?? 'UNKNOWN', version: strategy.version ?? 'UNKNOWN', hash: strategy.hash ?? 'UNKNOWN' },
          catalog: { tick: format(tick), lot: format(lot) },
          state: 'proposed', created_at: new Date(now()).toISOString(), confirmed_at: null,
          last_check_ms: null, observed_data_age_ms: null, quote_source: null, prev_mark: null,
          triggered: null, fees_funding_modeled: false, slippage_bps,
          disclosures: ['Simulated stop is NOT a guaranteed exact fill — gap/slippage modeled.', 'Fees and funding are NOT modeled by this engine; realized P&L excludes them.'],
        };
        save(b); audit(owner, 'proposal', b, { strategy: b.strategy });
        return { bracket: b, live_mode: false };
      });
    },

    // §1/§2 Confirmation: explicit user confirmation makes the bracket managed (confirmed/active).
    confirm({ trade_id, owner, requestKey }) {
      return mutate(requestKey, { op: 'confirm', trade_id }, () => {
        const b = load(trade_id); if (!b) fail('bracket_not_found', 404); if (b.owner !== owner) fail('not_owner', 403);
        if (b.state === 'confirmed/active') return { bracket: b, live_mode: false };
        if (b.state !== 'proposed') fail('not_confirmable', 409, `state ${b.state}`);
        b.state = 'confirmed/active'; b.confirmed_at = new Date(now()).toISOString();
        save(b); audit(owner, 'confirmation', b);
        return { bracket: b, live_mode: false };
      });
    },

    // Manual cancel of the protective bracket (leaves the position; just removes protection).
    // Races with a fill: if already triggered/closed, this is a no-op conflict, never a double action.
    cancel({ trade_id, owner, requestKey }) {
      return mutate(requestKey, { op: 'cancel', trade_id }, () => {
        const b = load(trade_id); if (!b) fail('bracket_not_found', 404); if (b.owner !== owner) fail('not_owner', 403);
        if (['triggered', 'closed'].includes(b.state)) fail('already_resolved', 409, `state ${b.state}`);
        if (b.state === 'cancelled') return { bracket: b, live_mode: false };
        b.state = 'cancelled'; save(b); audit(owner, 'cancel', b);
        return { bracket: b, live_mode: false };
      });
    },

    // Observe a feed and enforce every active bracket deterministically. Stale/invalid → pause+alert
    // (no simulated mutation). On trigger → sibling-cancel (intrinsic) + reduce-only close (via the
    // optional reducePosition callback), state triggered→closed, audit. Idempotent per (trade,leg).
    onObservation({ owner, feed, reducePosition } = {}) {
      const alerts = []; const events = [];
      const rows = allRows.all().map(r => JSON.parse(r.data)).filter(b => (!owner || b.owner === owner) && b.state === 'confirmed/active');
      for (const b of rows) {
        const qa = assessQuote(feed, b.symbol, now());
        // Each trade's mutation is its own serialized transaction (atomic vs manual cancel/close).
        try {
          const out = mutate(null, null, () => {
            const cur = load(b.trade_id);
            if (!cur || cur.state !== 'confirmed/active') return { skipped: true }; // lost a race → skip
            if (!qa.ok) {
              cur.state = 'stale/unmanaged'; cur.last_check_ms = now(); cur.quote_source = qa.source; cur.observed_data_age_ms = qa.observed_age_ms ?? null;
              save(cur); audit('engine', 'paused_stale_data', cur, { reason: qa.reason });
              return { paused: true, reason: qa.reason, bracket: cur };
            }
            // Conservative two-mark evaluation of prior mark → current mark (captures poll-gap
            // overshoot; precision is bounded by feed cadence, never finer, never optimistic).
            const mark = qa.mark; const prev = cur.prev_mark ?? mark;
            const decision = evaluateMarks(cur, prev, mark, { slippage_bps: cur.slippage_bps });
            cur.last_check_ms = now(); cur.quote_source = qa.source; cur.observed_data_age_ms = qa.observed_age_ms; cur.prev_mark = mark;
            if (!decision.leg) { save(cur); return { held: true, bracket: cur }; }
            // TRIGGER: OCO sibling is intrinsically cancelled (single record). Reduce-only close.
            cur.state = 'triggered';
            cur.triggered = { leg: decision.leg, fill_price: decision.fill_price, reason: decision.reason, both_touched: decision.both_touched, gap: decision.gap, at: new Date(now()).toISOString(), quote_source: qa.source, observed_age_ms: qa.observed_age_ms };
            audit('engine', 'trigger', cur, { leg: decision.leg, fill_price: decision.fill_price, reason: decision.reason, sibling_cancelled: decision.leg === 'stop' ? 'target' : 'stop' });
            let reduce = null;
            if (typeof reducePosition === 'function') {
              // reduce-only close of the paper position at the deterministic trigger price.
              reduce = reducePosition({ trade_id: cur.trade_id, owner: cur.owner, symbol: cur.symbol, side: cur.side, quantity: cur.quantity, price: decision.fill_price, leg: decision.leg });
            }
            cur.state = 'closed';
            save(cur); audit('engine', 'closed', cur, { via: decision.leg, reduce_only: true });
            return { triggered: true, leg: decision.leg, fill_price: decision.fill_price, reason: decision.reason, reduce, bracket: cur };
          });
          if (out.paused) alerts.push({ trade_id: b.trade_id, reason: out.reason });
          if (out.triggered) events.push({ trade_id: b.trade_id, leg: out.leg, fill_price: out.fill_price, reason: out.reason });
        } catch (e) { alerts.push({ trade_id: b.trade_id, reason: e.code || 'engine_error' }); }
      }
      return { alerts, events, live_mode: false };
    },

    // §3 restart reconciliation: re-check persisted active/stale brackets against live state before
    // resuming. Stale brackets recover to active only when data is valid again; nothing is fabricated.
    reconcile({ owner, feed } = {}) {
      const reconciled = [];
      const rows = allRows.all().map(r => JSON.parse(r.data)).filter(b => (!owner || b.owner === owner) && ['confirmed/active', 'stale/unmanaged'].includes(b.state));
      for (const b of rows) {
        const qa = assessQuote(feed, b.symbol, now());
        mutate(null, null, () => {
          const cur = load(b.trade_id); if (!cur) return {};
          const wasStale = cur.state === 'stale/unmanaged';
          if (qa.ok && wasStale) { cur.state = 'confirmed/active'; cur.last_check_ms = now(); cur.quote_source = qa.source; save(cur); audit('engine', 'reconciled_resumed', cur); }
          else if (!qa.ok && cur.state === 'confirmed/active') { cur.state = 'stale/unmanaged'; cur.last_check_ms = now(); save(cur); audit('engine', 'reconciled_paused', cur, { reason: qa.reason }); }
          else { cur.last_check_ms = now(); save(cur); }
          reconciled.push({ trade_id: cur.trade_id, state: cur.state });
          return {};
        });
      }
      return { reconciled, live_mode: false };
    },

    get(trade_id) { const b = load(trade_id); if (!b) fail('bracket_not_found', 404); return b; },
    list({ owner } = {}) { return { brackets: allRows.all().map(r => JSON.parse(r.data)).filter(b => !owner || b.owner === owner), live_mode: false }; },

    // §2 honest enrollment: positions with no confirmed bracket are unprotected/needs-levels. NEVER
    // retro-assigned a stop. Caller passes its open positions; we only classify, never mutate them.
    listUnprotected(positions = [], { owner } = {}) {
      const managed = new Set(allRows.all().map(r => JSON.parse(r.data)).filter(b => ['proposed', 'confirmed/active', 'triggered'].includes(b.state)).map(b => b.trade_id));
      return positions
        .filter(p => (!owner || p.owner === owner) && !managed.has(p.id ?? p.trade_id))
        .map(p => ({ trade_id: p.id ?? p.trade_id, symbol: p.symbol, side: p.side, quantity: p.quantity, state: 'unprotected', note: 'unprotected / needs levels — supply or confirm protective levels; never retro-assigned.' }));
    },

    auditTrail({ limit = 200 } = {}) { return db.prepare('SELECT data FROM audit ORDER BY seq DESC LIMIT ?').all(limit).map(r => JSON.parse(r.data)); },
  };
  return engine;
}
