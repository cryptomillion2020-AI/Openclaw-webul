/** BloFin instrument catalog — build-time captured snapshot.
 *
 * Why a snapshot and not a live browser fetch: api.blofin.com sets
 * `access-control-allow-origin: https://blofin.com`, so a browser on this
 * origin cannot read it directly (CORS). The origin backend consumes an
 * out-of-band published shared-state file (runtime/trading-api.mjs PERP_PATH)
 * rather than proxying the venue live, and no per-instrument catalog route
 * exists. This module therefore ships a static snapshot captured at build
 * time, carrying its own provenance and capture timestamp. It is NOT a live
 * feed; treat listings as potentially stale and never as an execution price.
 *
 * Perp symbols verified from /uapi/v1/market/symbol/all; spot symbols verified
 * from their own dedicated endpoint /sapi/v1/market/symbol/all. Aliases (BTC ->
 * BTC-USDT) are resolved FROM this catalog, never hardcoded.
 */
import snapshot from './blofinCatalog.snapshot.json';

export const BLOFIN_CATALOG_PROVENANCE = Object.freeze({ ...snapshot.provenance });
export const BLOFIN_CATALOG_COUNTS = Object.freeze({ ...snapshot.counts });

export const INSTRUMENT_CLASS = Object.freeze({ PERP: 'crypto_perp', SPOT: 'crypto_spot' });

const CLASS_ROWS = Object.freeze({
  [INSTRUMENT_CLASS.PERP]: Object.freeze(snapshot.perp.map(Object.freeze)),
  [INSTRUMENT_CLASS.SPOT]: Object.freeze(snapshot.spot.map(Object.freeze)),
});

/** Snapshot age classification. A build-time snapshot is never "fresh" in the
 * live sense; we surface its capture age so the UI can caveat honestly. */
export function catalogState(now = Date.now()) {
  const captured = Date.parse(BLOFIN_CATALOG_PROVENANCE.captured_at);
  if (!Number.isFinite(captured)) return { state: 'UNKNOWN', ageSeconds: null, capturedAt: BLOFIN_CATALOG_PROVENANCE.captured_at };
  const ageSeconds = Math.max(0, (now - captured) / 1000);
  return { state: 'SNAPSHOT', ageSeconds, capturedAt: BLOFIN_CATALOG_PROVENANCE.captured_at };
}

export function classRows(instrumentClass = INSTRUMENT_CLASS.PERP) {
  return CLASS_ROWS[instrumentClass] || [];
}

/** Normalize free-text input to the catalog's symbol convention. */
export function normalizeSymbolInput(input) {
  return String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Resolve an alias to a catalog symbol, derived FROM the catalog:
 *  - exact symbol match wins (e.g. "BTC-USDT")
 *  - bare base with exactly one listing in the class resolves (e.g. "BTC" -> "BTC-USDT")
 *  Returns the matching row, or null if unresolved/ambiguous. */
export function resolveInstrument(input, instrumentClass = INSTRUMENT_CLASS.PERP) {
  const q = normalizeSymbolInput(input);
  if (!q) return null;
  const rows = classRows(instrumentClass);
  const exact = rows.find(r => r.symbol === q);
  if (exact) return exact;
  const byBase = rows.filter(r => r.base === q);
  return byBase.length === 1 ? byBase[0] : null;
}

/** Debounce-friendly search over the snapshot. Matches symbol, base, or name
 *  (substring, case-insensitive). Returns a bounded page plus total count so
 *  the UI can paginate without rendering 800+ rows. */
export function searchCatalog({ query = '', instrumentClass = INSTRUMENT_CLASS.PERP, limit = 25, offset = 0 } = {}) {
  const rows = classRows(instrumentClass);
  const q = normalizeSymbolInput(query);
  const matched = q
    ? rows.filter(r => r.symbol.includes(q) || r.base.includes(q) || String(r.name).toUpperCase().includes(q))
    : rows;
  const total = matched.length;
  const page = matched.slice(offset, offset + limit);
  return { rows: page, total, offset, limit, hasMore: offset + limit < total, query: q, instrumentClass };
}
