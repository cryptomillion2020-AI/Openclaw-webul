// Executor adapter binding the emergency close-all state machine to the REAL operational PAPER
// simulation ledger — WITHOUT modifying the F-1-qualified paper-simulation.mjs.
//
// The frozen engine (paper-simulation.mjs 48ae6f42) requires a server-owned per-trade approval for
// every cancel/reduce. This adapter mints those approvals in bulk under ONE authenticated emergency
// activation (server authority, not a client boolean), then calls the engine EXACTLY as designed:
//   - cancel: needs no quote -> always eligible, even under stale market data.
//   - reduce-to-zero (close): the engine's quote() throws market_data_stale /
//     approved_perp_data_unavailable when data is not defensible. That throw propagates as the
//     per-position data blocker — the switch records it UNRESOLVED and never invents a fill/flat.
// Idempotency keys are deterministic per (owner,id,action) so repeated activation dedupes safely.
import { fingerprint } from './paper-ledger.mjs';

const pos = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
// Idempotency key: engine charset is [-a-zA-Z0-9_]{8,128}. UUID ids satisfy it; sanitize + pad defensively.
const keyFor = (prefix, id) => (prefix + String(id).replace(/[^-a-zA-Z0-9_]/g, '')).slice(0, 128).padEnd(8, '0');

// ledger        : the operational PaperSimulation instance (real orders/positions live here)
// requestApproval: the server-owned gate.requestApproval sharing the ledger's verifyApproval receipts
// getSnapshot   : async () => market state (fresh perp feed or stale) — the same source the routes use
export function createSimulationKillExecutor({ ledger, requestApproval, getSnapshot }) {
  if (!ledger || typeof ledger.view !== 'function' || typeof ledger.transaction !== 'function')
    throw new Error('operational paper ledger required');
  if (typeof requestApproval !== 'function') throw new Error('server approval authority required');
  if (typeof getSnapshot !== 'function') throw new Error('market snapshot source required');

  const identityOf = owner => ({ authenticated: true, subject: owner });

  return {
    listPending({ owner }) {
      const v = ledger.view(identityOf(owner));
      return v.orders.filter(o => ['pending', 'partial'].includes(o.status) && pos(o.remaining))
        .map(o => ({ id: o.id, symbol: o.symbol, kind: o.type }));
    },
    listOpenPositions({ owner }) {
      const v = ledger.view(identityOf(owner));
      return v.positions.filter(p => p.status === 'open' && pos(p.quantity))
        .map(p => ({ id: p.id, symbol: p.symbol, quantity: p.quantity }));
    },
    async cancelPending({ owner, id }) {
      const input = { id };
      const approval = await requestApproval({ principal: identityOf(owner), action: 'cancel', input, confirmation: 'CONFIRM PAPER' });
      ledger.transaction(identityOf(owner), keyFor('kill-cxl-', id), 'cancel', { id, approval }, await getSnapshot());
    },
    async closePosition({ owner, id, quantity }) {
      const input = { id, quantity };
      const approval = await requestApproval({ principal: identityOf(owner), action: 'reduce', input, confirmation: 'CONFIRM PAPER' });
      // reduce-to-zero. quote() inside the engine throws on stale/missing data -> propagates as blocker.
      ledger.transaction(identityOf(owner), keyFor('kill-cls-', id), 'reduce', { id, quantity, approval }, await getSnapshot());
    },
  };
}
