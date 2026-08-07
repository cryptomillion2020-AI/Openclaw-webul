/** Provider-neutral market feed contract.
 *
 * The browser consumes the local market-context publisher rather than exposing
 * provider credentials. Changing VITE_MARKET_FEED_PROVIDER changes the adapter;
 * pages only consume the normalized snapshot returned here.
 */
/* Feed inventory — reconciled to SEVIN live-credential verification 2026-08-06
 * (workspace/FEED-CREDENTIAL-LIVE-VERIFICATION-20260806.md). Every keyed source
 * below returned HTTP 200 on a free-tier read; keys are server-side only and
 * never reach the browser.
 *
 *   tier    — billing class. 'free' = zero-spend read. 'metered' = would bill;
 *             none are active (zero autonomous spend is in force).
 *   status  — 'live' (verified reachable) | 'geo-blocked' (unreachable from host).
 *   role    — 'market-context' (surfaced into the snapshot the pages render)
 *           | 'research-state' (fetched to shared/state/research, NOT aggregated
 *             into Market Context — binding per E.4 for Finnhub sentiment)
 *           | 'disabled' (not contributing).
 */
export const MARKET_FEED_INVENTORY = Object.freeze([
  { id: 'fred', name: 'FRED', tier: 'free', status: 'live', role: 'market-context', cost: '$0', auth: 'free API key (server-side, query param)', rateLimit: 'provider throttle; publisher backoff', fields: 'regime, yield curves, rates, VIX' },
  { id: 'coingecko', name: 'CoinGecko Demo', tier: 'free', status: 'live', role: 'market-context', cost: '$0', auth: 'demo key (server-side, x_cg_demo_api_key)', rateLimit: 'demo-plan limit; publisher backoff', fields: 'btc dominance, funding, open interest, categories' },
  { id: 'alpha-vantage', name: 'Alpha Vantage', tier: 'free', status: 'live', role: 'market-context', cost: '$0', auth: 'free API key (server-side, query param)', rateLimit: '5 requests/minute', fields: 'equity prices, market status' },
  { id: 'fear-greed', name: 'Alternative.me Fear & Greed', tier: 'free', status: 'live', role: 'market-context', cost: '$0', auth: 'none (public)', rateLimit: 'public endpoint; polite polling', fields: 'crypto sentiment' },
  { id: 'finnhub', name: 'Finnhub', tier: 'free', status: 'live', role: 'research-state', cost: '$0', auth: 'free API key (server-side, query param)', rateLimit: 'free-plan limit', fields: 'news/calendars (research-state; sentiment NOT aggregated per E.4)' },
  { id: 'api-ninjas', name: 'API Ninjas', tier: 'free', status: 'live', role: 'research-state', cost: '$0', auth: 'free API key (server-side, X-Api-Key header)', rateLimit: 'free-plan limit', fields: 'earnings (research-state; premium fields absent, never rendered)' },
  { id: 'binance-public', name: 'Binance Futures Public', tier: 'free', status: 'geo-blocked', role: 'disabled', cost: '$0', auth: 'none (public)', rateLimit: 'IP/request-weight limits', fields: 'perpetual tickers, long/short ratios — geo-blocked from US host (AD-D2-A1)' },
]);

/** Counts for the free-tier vs metered split, computed from the inventory. */
export function feedInventoryCounts(inventory = MARKET_FEED_INVENTORY) {
  return {
    liveFree: inventory.filter(f => f.tier === 'free' && f.status === 'live').length,
    metered: inventory.filter(f => f.tier === 'metered').length,
    disabled: inventory.filter(f => f.status !== 'live').length,
  };
}

export const ACTIVE_MARKET_PROVIDER = import.meta.env.VITE_MARKET_FEED_PROVIDER || 'market-context-v1';

const adapters = {
  'market-context-v1': (context) => ({
    provider: 'market-context-v1',
    generatedAt: context?.generated_at ?? null,
    ttlSeconds: Number(context?.freshness_ttl_seconds ?? 600),
    equities: context?.equity_prices && typeof context.equity_prices === 'object' ? context.equity_prices : {},
    macro: context?.macro && typeof context.macro === 'object' ? context.macro : {},
    crypto: context?.crypto_orderflow && typeof context.crypto_orderflow === 'object' ? context.crypto_orderflow : {},
    quality: context?.data_quality && typeof context.data_quality === 'object' ? context.data_quality : {},
    raw: context ?? null,
  }),
};

export function normalizeMarketFeed(context, provider = ACTIVE_MARKET_PROVIDER) {
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`Unknown market feed provider: ${provider}`);
  return adapter(context);
}

export function marketFeedState(snapshot, now = Date.now()) {
  if (!snapshot?.generatedAt) return { state: 'DEAD', ageSeconds: null };
  const generated = Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generated)) return { state: 'DEAD', ageSeconds: null };
  const ageSeconds = Math.max(0, (now - generated) / 1000);
  return { state: ageSeconds > snapshot.ttlSeconds ? 'STALE' : 'LIVE', ageSeconds };
}
