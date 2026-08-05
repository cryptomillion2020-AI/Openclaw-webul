/**
 * Markets.jsx — Pass 3 P3.1 Tier 5 — Trading rebrand
 * ConstellationScene background + Bento grid with Mode-3 gates,
 * P&L hero, open positions, recent trades, risk summary.
 * Markets-only tokens (--market-bullish/-bearish) per Pineify ingestion.
 */
import { ConstellationScene } from '../three/ConstellationScene';

const MOCK_GATES = [
  { name: 'Kill Switch Inactive', status: 'pass' },
  { name: 'Paper Mode Confirmed', status: 'pass' },
  { name: 'STAN Audit Passed',    status: 'pass' },
  { name: 'OAuth Authorized',     status: 'pass' },
  { name: 'Quote Channel Live',   status: 'fail' },
  { name: 'Run-Window Open',      status: 'fail' },
];

const MOCK_PNL = { current: 1248.32, delta24h: 142.18, direction: 'up' };

const MOCK_POSITIONS = [
  { symbol: 'BTC-USD',  side: 'long',  qty: 0.082,  entry: 67432.10, mark: 68910.50, pnl: 121.21, pnlPct: 2.19 },
  { symbol: 'ETH-USD',  side: 'long',  qty: 1.43,   entry: 3742.50,  mark: 3801.20,  pnl: 83.94,  pnlPct: 1.57 },
  { symbol: 'SOL-USD',  side: 'short', qty: 22.0,   entry: 195.42,   mark: 192.10,   pnl: 73.04,  pnlPct: 1.70 },
];

const MOCK_TRADES = [
  { ts: '14:22:18', symbol: 'BTC', side: 'BUY',  qty: 0.012, px: 68876.50 },
  { ts: '14:18:01', symbol: 'ETH', side: 'BUY',  qty: 0.45,  px: 3798.10 },
  { ts: '13:55:42', symbol: 'SOL', side: 'SELL', qty: 8.0,   px: 192.85 },
  { ts: '13:42:11', symbol: 'BTC', side: 'BUY',  qty: 0.04,  px: 68512.30 },
  { ts: '13:30:08', symbol: 'ETH', side: 'BUY',  qty: 0.98,  px: 3750.40 },
];

export function Markets({ busActivity, marketContext, feedHealth }) {
  const pnlClass = MOCK_PNL.direction === 'down' ? 'is-bearish' : '';
  const marketFeed = feedHealth?.market_context;
  const contextLive = marketFeed?.state === 'LIVE' ? marketContext : null;
  return (
    <div className="markets-page">
      <ConstellationScene busActivity={busActivity} />

      <div className="markets-grid">
        <div className="bento-card">
          <div className="bento-card-label">Market Context · {marketFeed?.state || 'DEAD'}</div>
          {contextLive ? (
            <>
              <div className="bento-card-hero">{contextLive.sentiment?.regime || contextLive.volatility?.regime || 'Current'}</div>
              <div className="bento-card-sub">Generated {contextLive.generated_at || 'timestamp unavailable'}</div>
              <div className="gate-row"><span>Macro</span><span>{contextLive.macro?.regime || contextLive.macro?.summary || 'available'}</span></div>
              <div className="gate-row"><span>Data quality</span><span>{contextLive.data_quality?.status || 'available'}</span></div>
            </>
          ) : (
            <div className="bento-card-sub">No current market-context data. Feed {marketFeed?.state || 'DEAD'}{marketFeed?.lastMessageAt ? ` since ${new Date(marketFeed.lastMessageAt).toLocaleTimeString()}` : ''}.</div>
          )}
        </div>
        <div className={`bento-card markets-pnl ${pnlClass}`}>
          <div className="bento-card-label">Open P&L (Paper)</div>
          <div className="bento-card-hero">${MOCK_PNL.current.toFixed(2)}</div>
          <div className="bento-card-sub">3 positions · paper mode</div>
          <div className={`bento-card-delta ${MOCK_PNL.delta24h >= 0 ? 'up' : 'down'}`}>
            <span>{MOCK_PNL.delta24h >= 0 ? '▲' : '▼'} ${Math.abs(MOCK_PNL.delta24h).toFixed(2)}</span>
            <span className="bento-card-timeframe">24h</span>
          </div>
        </div>

        <div className="bento-card markets-gates">
          <div className="bento-card-label">Mode-3 Gates</div>
          {MOCK_GATES.map(g => (
            <div key={g.name} className="gate-row">
              <span>{g.name}</span>
              <span className={`gate-pill ${g.status}`}>{g.status.toUpperCase()}</span>
            </div>
          ))}
        </div>

        <div className="bento-card markets-positions">
          <div className="bento-card-label">Open Positions</div>
          <table className="positions-table">
            <thead>
              <tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Mark</th><th>P&L</th><th>%</th></tr>
            </thead>
            <tbody>
              {MOCK_POSITIONS.map(p => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td className={`pos-side ${p.side}`}>{p.side.toUpperCase()}</td>
                  <td>{p.qty}</td>
                  <td>${p.entry.toLocaleString()}</td>
                  <td>${p.mark.toLocaleString()}</td>
                  <td className={`pos-pnl ${p.pnl >= 0 ? 'profit' : 'loss'}`}>
                    {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                  </td>
                  <td className={`pos-pnl ${p.pnl >= 0 ? 'profit' : 'loss'}`}>
                    {p.pnl >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bento-card markets-trades">
          <div className="bento-card-label">Recent Trades</div>
          <table className="positions-table">
            <thead>
              <tr><th>Time</th><th>Sym</th><th>Side</th><th>Qty</th><th>Px</th></tr>
            </thead>
            <tbody>
              {MOCK_TRADES.map((t, i) => (
                <tr key={i}>
                  <td>{t.ts}</td>
                  <td>{t.symbol}</td>
                  <td className={`pos-side ${t.side === 'BUY' ? 'long' : 'short'}`}>{t.side}</td>
                  <td>{t.qty}</td>
                  <td>${t.px.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bento-card markets-risk">
          <div className="bento-card-label">Risk Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Day P&L</span>
              <span style={{ color: 'var(--market-bullish)' }}>+$142.18</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Max Drawdown</span>
              <span style={{ color: 'var(--market-bearish)' }}>-$38.50</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Exposure</span>
              <span>$8,742.16</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Free Margin</span>
              <span>$11,257.84</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
