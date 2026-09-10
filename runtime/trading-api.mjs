// Owner-local public-data projection. No credential, account, broker or order adapter.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const SYMBOLS = Object.freeze(['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT']);
export const PERP_PATH = '/home/k/.openclaw/shared/state/crypto/perp/current.json';
export const POLICY = Object.freeze({ max_leverage: null, max_funding_cost_fraction: null, holding_horizon_intervals: null, risk_per_trade: null, architect_authorized: false });
const decimal = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;
const positive = value => { const n = decimal(value); return n !== null && n > 0 ? n : null; };

export function projectPerp(envelope, now = Date.now()) {
  const base = { venue: 'BloFin', instrument_class: 'crypto_perp', source: 'blofin_public', generated_at: null, ttl_seconds: null, state: 'unavailable', reason: 'publisher_unavailable', rows: [] };
  if (!envelope || envelope.source !== 'blofin_public' || envelope.instrument_class !== 'crypto_perp' || envelope.map !== 'crypto_prices' || !envelope.crypto_prices || typeof envelope.crypto_prices !== 'object') return base;
  const generated = Date.parse(envelope.generated_at);
  const ttl = positive(envelope.freshness_ttl_seconds);
  const age = (now - generated) / 1000;
  const metadataValid = Number.isFinite(generated) && ttl !== null && age >= 0;
  const fresh = metadataValid && age <= ttl && envelope.data_quality?.all_fetches_ok === true && envelope.data_quality?.all_feeds_fresh === true && envelope.data_quality?.paper_only === true;
  const rows = SYMBOLS.flatMap(symbol => {
    const r = envelope.crypto_prices[symbol];
    if (!r || r.instId !== symbol) return [];
    const rowTime = positive(r.ts);
    const rowFresh = fresh && rowTime !== null && now >= rowTime && (now - rowTime) / 1000 <= ttl;
    const exact={bid:r.bidPrice,ask:r.askPrice,mark:r.markPrice,funding_rate:r.funding_rate??r.fundingRate};
    return [{ symbol, exact, state: rowFresh && positive(r.last) !== null ? 'fresh' : 'stale', observed_at_ms: rowTime, last: positive(r.last), bid: positive(r.bidPrice), ask: positive(r.askPrice), mark: positive(r.markPrice), funding_rate: decimal(r.funding_rate ?? r.fundingRate) }];
  });
  return { ...base, generated_at: Number.isFinite(generated) ? envelope.generated_at : null, ttl_seconds: ttl, age_seconds: Number.isFinite(age) ? Math.max(0, Math.floor(age)) : null, state: !rows.length ? 'empty' : fresh && rows.some(r => r.state === 'fresh') ? 'fresh' : 'stale', reason: !rows.length ? 'no_supported_symbols' : fresh ? null : 'publisher_stale_or_unverified', rows };
}

export async function snapshot({ read = readFile, now = Date.now() } = {}) {
  let perp = projectPerp(null, now);
  try {
    const bytes = await read(PERP_PATH);
    const envelope=JSON.parse(bytes.toString());
    if(envelope.fixture===true)throw new Error('Fixture publisher is never operational market data');
    perp = { ...projectPerp(envelope, now), source_sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch { /* A missing, malformed or unreadable source is unavailable, never a fixture. */ }
  return {
    schema_version: 'trading-webui-1', observed_at: new Date(now).toISOString(), mode: 'paper-only', live_mode: false,
    safety_layers: { configuration: false, execution: false, orderRouting: false, ui: false },
    policy: POLICY, perp,
    spot: { venue: 'BloFin', instrument_class: 'crypto_spot', state: 'unavailable', reason: 'No independently verified BloFin spot transport. Perpetual swaps are never substituted.', rows: [] },
    journal: { state: 'unavailable', admission: false, reason: 'No approved risk policy or per-trade Architect authorization is wired. Legacy WebUI journal mutations are refused at this surface.' },
    account: { state: 'unavailable', reason: 'No account or credential access. Positions, balances and fills are not inferred.' },
  };
}

export function preflight(input, state) {
  const reasons = [];
  if (!input || input.mode !== 'paper' || !SYMBOLS.includes(input.symbol) || !['buy', 'sell'].includes(input.side) || positive(input.quantity) === null) reasons.push('invalid_paper_draft');
  if (input?.instrument_class !== 'crypto_perp') reasons.push('unsupported_instrument_class');
  if (state.perp.state !== 'fresh' || state.perp.rows.find(row => row.symbol === input?.symbol)?.state !== 'fresh') reasons.push('market_data_unavailable_or_stale');
  if (state.perp.rows.find(row => row.symbol === input?.symbol)?.funding_rate == null) reasons.push('funding_rate_unavailable');
  if (input && Object.keys(input).some(k => !['mode','symbol','side','quantity','instrument_class'].includes(k))) reasons.push('unsupported_fields');
  return { ok: reasons.length===0, admitted: false, confirmation_required:true, mode: 'paper-only', live_mode: false, checked_at: state.observed_at, reasons, effect: 'No order, journal entry, account call or position was created.' };
}

export { websocketDisposition } from './trading-ws-policy.mjs';
