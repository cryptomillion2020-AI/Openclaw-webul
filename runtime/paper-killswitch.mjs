// Deterministic server-side EMERGENCY PAPER close-all state machine ("Stop & close all paper trades").
//
// HARD BOUNDARIES (PAPER-ONLY — non-negotiable):
//   - No broker, account, credential, or live-order path. This module mints no real order and refuses
//     any live/real flag on input (assertPaperOnly -> 403 live_mode_denied). It orchestrates ONLY the
//     PAPER simulator ledger + PAPER bracket engine, through injected executor adapters.
//   - Deterministic CODE, not the LLM. Activation runs synchronously on the request; no debounce, no
//     LLM turn dependency, no optimistic client toggle. "KILL ACTIVE" is a BACKEND-ACK'd latch state.
//
// SEMANTICS (DIRECTIVE 20260912-190423 Work Item A):
//   - On authenticated activation, IMMEDIATELY and in order: (1) persist an entry LOCK (survives
//     refresh/restart — latch row in SQLite); (2) cancel-all pending paper orders INCLUDING related
//     bracket/OCO protective orders; (3) close/reduce-to-zero every open paper position under the
//     owner's scope. Ownership-scoped: only the owner's orders/positions are touched.
//   - COMPLETION ONLY when reconciliation confirms zero pending AND flat. On any failure the entry
//     lock is RETAINED and an explicit reason is surfaced.
//   - STALE / MISSING market data that prevents a defensible simulated close price: NEVER invent a
//     fill or claim flat. Cancel eligible orders, KEEP entries locked, report the unresolved closes +
//     the precise data blocker. State becomes kill_active_unresolved (still locked).
//   - Idempotent: repeated/duplicate activation is safe (re-reads live pending/open sets each pass;
//     nothing left to do -> completes; unresolved -> retries the eligible closes with current data).
//   - Atomic latch transitions (SQLite BEGIN IMMEDIATE). A concurrent activation observes the latch
//     and does not double-drive. New-entry submit consults assertEntryAllowed() and is rejected while
//     locked. RESUME is a separate deliberate action; it clears the lock and NEVER reopens a
//     closed/cancelled trade and NEVER auto-creates an entry.
import { DatabaseSync } from 'node:sqlite';

export class KillSwitchError extends Error {
  constructor(code, status = 422, detail) { super(code); this.code = code; this.status = status; this.detail = detail || null; }
}
const fail = (c, s = 422, d) => { throw new KillSwitchError(c, s, d); };

// Latch lifecycle. locked === entries refused. Only 'inactive' permits new entries.
export const KILL_STATES = Object.freeze(['inactive', 'killing', 'kill_active', 'kill_active_unresolved', 'resuming']);
const LOCKED = new Set(['killing', 'kill_active', 'kill_active_unresolved', 'resuming']);
const LIVE_FORBIDDEN = ['live', 'live_mode', 'real', 'real_money', 'broker', 'endpoint', 'api_key', 'account'];

function assertPaperOnly(obj) {
  if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) {
    if (LIVE_FORBIDDEN.includes(k.toLowerCase()) && obj[k]) fail('live_mode_denied', 403, `Field '${k}' refused: this engine is PAPER-ONLY.`);
  }
}
export { assertPaperOnly };

// executor adapter contract (all synchronous, PAPER-only, ownership-scoped by the caller-supplied owner):
//   listPending({ owner })        -> [{ id, symbol, kind }]         pending paper orders + protective brackets/OCO
//   listOpenPositions({ owner })  -> [{ id, symbol, quantity }]     open paper positions
//   cancelPending({ owner, id, kind })                              cancel one; already-terminal is a safe no-op
//   closePosition({ owner, id, symbol, quantity })                  reduce-to-zero; THROWS on stale/missing price
//     (the throw is the never-invent-fill contract; its .code becomes the per-item data blocker)
export function createPaperKillSwitch({ filename, now = Date.now, executor } = {}) {
  if (!filename) fail('explicit_store_path_required', 500);
  if (!executor || ['listPending', 'listOpenPositions', 'cancelPending', 'closePosition'].some(m => typeof executor[m] !== 'function'))
    fail('executor_required', 500, 'executor must implement listPending/listOpenPositions/cancelPending/closePosition');

  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;'
    + 'CREATE TABLE IF NOT EXISTS kill_latch (owner TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);'
    + 'CREATE TABLE IF NOT EXISTS kill_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT, event TEXT, at INTEGER, data TEXT);');

  const getLatch = db.prepare('SELECT state, data FROM kill_latch WHERE owner=?');
  const putLatch = db.prepare('INSERT INTO kill_latch (owner,state,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET state=excluded.state,data=excluded.data,updated_at=excluded.updated_at');
  const insEvent = db.prepare('INSERT INTO kill_events (owner,event,at,data) VALUES (?,?,?,?)');
  const qEvents = db.prepare('SELECT event, at, data FROM kill_events WHERE owner=? ORDER BY seq');

  const readLatch = (owner) => { const r = getLatch.get(owner); return r ? { state: r.state, ...JSON.parse(r.data) } : { state: 'inactive', locked: false }; };
  const writeLatch = (owner, state, data) => { putLatch.run(owner, state, JSON.stringify({ locked: LOCKED.has(state), ...data }), now()); };
  const logEvent = (owner, event, data) => insEvent.run(owner, event, now(), JSON.stringify(data || {}));

  // One reconciliation pass: cancel every pending order/bracket, then close every open position.
  // Never invents a fill — a stale/missing price throw is recorded as an unresolved close, not a flat.
  // Async: the real executor awaits server-owned approvals + a fresh market snapshot. A sync mock
  // executor works unchanged (awaiting a non-Promise is a no-op).
  async function sweep(owner) {
    const counts = { pending_found: 0, cancelled: 0, cancel_failed: 0, positions_found: 0, closed: 0, close_unresolved: 0 };
    const unresolved = [];
    const cancel_failures = [];

    // (2) Cancel-all pending FIRST (orders + protective bracket/OCO) so nothing fills mid-close.
    //     Cancellation needs no price and is always eligible; a bracket already terminal is a safe no-op.
    const pending = (await executor.listPending({ owner })) || [];
    counts.pending_found = pending.length;
    for (const o of pending) {
      try { await executor.cancelPending({ owner, id: o.id, kind: o.kind }); counts.cancelled++; }
      catch (e) { counts.cancel_failed++; cancel_failures.push({ id: o.id, symbol: o.symbol ?? null, kind: o.kind ?? null, reason: e?.code || e?.message || 'cancel_failed' }); }
    }

    // (3) Close/reduce-to-zero every open position. A defensible close price is REQUIRED; if the
    //     executor throws (market_data_stale / approved_perp_data_unavailable / …) we record the
    //     position as unresolved and NEVER fabricate a fill or a flat.
    const positions = (await executor.listOpenPositions({ owner })) || [];
    counts.positions_found = positions.length;
    for (const p of positions) {
      try { await executor.closePosition({ owner, id: p.id, symbol: p.symbol, quantity: p.quantity }); counts.closed++; }
      catch (e) { counts.close_unresolved++; unresolved.push({ id: p.id, symbol: p.symbol ?? null, quantity: p.quantity ?? null, reason: e?.code || e?.message || 'close_unresolved' }); }
    }
    return { counts, unresolved, cancel_failures };
  }

  const engine = {
    live_mode: false,
    close() { db.close(); },
    get states() { return KILL_STATES; },

    // Throws while the owner's latch is locked — the new-entry submit path consults this.
    assertEntryAllowed(owner) {
      if (!owner) fail('owner_required', 400);
      const l = readLatch(owner);
      if (l.locked) fail('entries_locked_kill_active', 409, `paper entries are locked (${l.state}); resume the kill switch to re-enable`);
      return true;
    },

    isLocked(owner) { return !!readLatch(owner).locked; },

    // ACTIVATE — deterministic emergency close-all. Backend-ACK'd; latch persists across restart.
    // Safe to call repeatedly (idempotent). Measures ack + completion times.
    async activate({ owner, input } = {}) {
      if (!owner) fail('owner_required', 400);
      assertPaperOnly(input || {});
      const ack_at = now();

      // Atomically claim the lock. A concurrent activation that finds us mid-kill won't double-drive.
      db.exec('BEGIN IMMEDIATE');
      let claimed = false;
      try {
        const cur = readLatch(owner);
        if (cur.state === 'killing') { db.exec('COMMIT'); return { ...cur, owner, ack_at, in_progress: true, live_mode: false }; }
        writeLatch(owner, 'killing', { ack_at, activation_seq: (cur.activation_seq ?? 0) + 1 });
        logEvent(owner, 'kill_requested', { ack_at });
        db.exec('COMMIT'); claimed = true;
      } catch (e) { if (!claimed) db.exec('ROLLBACK'); throw e; }

      // Reconciliation sweep runs OUTSIDE the latch txn (executor drives sibling stores atomically).
      const { counts, unresolved, cancel_failures } = await sweep(owner);

      // COMPLETION only on reconciled zero-pending AND flat. Re-read live sets to confirm.
      const remainingPending = ((await executor.listPending({ owner })) || []).length;
      const remainingOpen = ((await executor.listOpenPositions({ owner })) || []).length;
      const flat = remainingOpen === 0;
      const zeroPending = remainingPending === 0;
      const resolved = flat && zeroPending && counts.cancel_failed === 0 && counts.close_unresolved === 0;
      const completed_at = now();

      const state = resolved ? 'kill_active' : 'kill_active_unresolved';
      const data_blocker = resolved ? null
        : (unresolved[0]?.reason || cancel_failures[0]?.reason || (remainingOpen ? 'positions_still_open' : 'pending_still_open'));
      const result = {
        owner, state, locked: true, ack_at, completed_at,
        ack_ms: 0, completion_ms: completed_at - ack_at,
        counts, unresolved, cancel_failures,
        remaining: { pending: remainingPending, open: remainingOpen },
        data_blocker, reconciled_flat: resolved,
        // Honest labelling: this is a real backend latch + reconciliation, not a mere UI toggle.
        note: resolved ? 'All eligible paper orders cancelled and positions closed; entries locked.'
                       : 'Entries LOCKED. Some closes UNRESOLVED (no defensible price / cancel failure) — NOT flat, NO fill invented. Retry when data resolves or resume to unlock.',
        live_mode: false,
      };
      db.exec('BEGIN IMMEDIATE');
      try { writeLatch(owner, state, result); logEvent(owner, resolved ? 'kill_completed' : 'kill_unresolved', result); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      return result;
    },

    // RESUME — separate, deliberate. Clears the lock. Does NOT reopen closed/cancelled trades and does
    // NOT auto-create entries; it only lifts the entry lock so the owner may place NEW trades again.
    resume({ owner, input } = {}) {
      if (!owner) fail('owner_required', 400);
      assertPaperOnly(input || {});
      db.exec('BEGIN IMMEDIATE');
      try {
        const cur = readLatch(owner);
        if (cur.state === 'inactive') { db.exec('COMMIT'); return { owner, state: 'inactive', locked: false, already: true, live_mode: false }; }
        const resumed_at = now();
        writeLatch(owner, 'inactive', { resumed_at, prior_state: cur.state, reopened: false, auto_created: false });
        logEvent(owner, 'kill_resumed', { resumed_at, prior_state: cur.state });
        db.exec('COMMIT');
        return { owner, state: 'inactive', locked: false, reopened: false, auto_created: false, resumed_at, note: 'Entry lock lifted. No closed/cancelled trade reopened; no entry auto-created.', live_mode: false };
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },

    // Read-only latch state + last reconciliation counts/unresolved.
    status({ owner } = {}) {
      if (!owner) fail('owner_required', 400);
      const l = readLatch(owner);
      return { owner, state: l.state, locked: !!l.locked, counts: l.counts ?? null, unresolved: l.unresolved ?? [], cancel_failures: l.cancel_failures ?? [], data_blocker: l.data_blocker ?? null, ack_at: l.ack_at ?? null, completed_at: l.completed_at ?? null, completion_ms: l.completion_ms ?? null, reconciled_flat: l.reconciled_flat ?? null, live_mode: false };
    },

    // Append-only audit of kill requests / completions / resumes.
    auditTrail({ owner, limit = 200 } = {}) {
      if (!owner) fail('owner_required', 400);
      return qEvents.all(owner).slice(-limit).reverse().map(e => ({ event: e.event, at: new Date(e.at).toISOString(), ...JSON.parse(e.data) }));
    },
  };
  return engine;
}
