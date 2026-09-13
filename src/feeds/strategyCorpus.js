/** QUANT strategy corpus — header metadata for the authenticated library view.
 *
 * Item A (directive 20260912-155614) adds an authenticated same-origin view of a
 * curated subset of this corpus. The file list itself is fetched live from the
 * server surface `/api/research/strategy-library` (server-side allowlist, curated,
 * realpath-contained) — this constant only supplies the header caption and the
 * standing caveats. No wholesale republication; no performance claim.
 */
export const STRATEGY_CORPUS = Object.freeze({
  title: 'QUANT crypto Pine strategy corpus',
  location: '/home/k/.openclaw/workspace/knowledge/quant-crypto-pine-20260825/',
  sourced: '2026-08-25',
  venue: 'BloFin perpetuals (crypto_perp); spot not covered by the strategy set',
  served: true,
  caveats: Object.freeze([
    'Curated authenticated view — raw chunks, pre-final drafts and failed-QA material are withheld server-side.',
    'Sourced 2026-08-25; treat as historical. No new research or updated backtest is implied.',
    'No performance, profitability, or forward-return claim is made or endorsed by this page.',
    'Strategies are authored/tested for BloFin perpetuals (crypto_perp). Spot is not covered; do not read spot applicability into them.',
    'TradingView Pine artifacts are display/research material only, never an execution input to the paper engine.',
  ]),
});
