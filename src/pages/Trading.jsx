/**
 * Trading.jsx — Page 3: Trading Platform
 * Uses pages.css class names
 */

import { useState } from 'react';
import { ControlsCluster } from '../components/ControlsCluster';
import { normalizeMarketFeed, marketFeedState } from '../feeds/marketFeeds';
import strategyLab from '../data/quant-strategy-lab.json';

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'charts',     label: 'Live Charts' },
  { id: 'execution',  label: 'Trade Execution' },
  { id: 'strategy',   label: 'Strategy Lab' },
];

const dim = 'rgba(255,255,255,0.5)';
const faint = 'rgba(255,255,255,0.3)';
const okColor = '#01B574';
const holdColor = '#f53939';

// Strategy Lab — QUANT A2. Read-only view of shadow-mode proposals + gate/survival surface.
// Mode 2 proposal-only; nothing here can place a trade. All numbers are trade_calc outputs.
function StrategyLab({ mode3Conditions, killActive }) {
  const b = strategyLab.banner;
  const gateState = (key) => {
    if (key === 'kill_switch_inactive') return !killActive;
    return mode3Conditions?.[key] === true;
  };
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        padding: '10px 14px', borderRadius: 12, marginBottom: 14,
        background: 'rgba(245,57,57,0.10)', border: '1px solid rgba(245,57,57,0.3)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: holdColor }}>⛔ {b.title}</div>
        <div style={{ fontSize: 11, color: dim, marginTop: 4 }}>{b.detail}</div>
      </div>

      {/* Mode 3 gate ledger */}
      <div className="chart-card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Mode 3 Gates — all must be OPEN to graduate</h3>
        {strategyLab.mode3_gates.map((g) => {
          const open = gateState(g.key);
          return (
            <div key={g.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: open ? okColor : holdColor, fontWeight: 700, minWidth: 66 }}>{open ? 'OPEN' : 'CLOSED'}</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', minWidth: 190 }}>{g.label}</span>
              <span style={{ color: faint }}>{g.why_closed}</span>
            </div>
          );
        })}
      </div>

      {/* Candidate strategies */}
      <div className="chart-card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Candidate Strategies ({strategyLab.candidates.length}) — shadow proposals</h3>
        {strategyLab.candidates.map((c) => (
          <div key={c.strategy_id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              {c.strategy_id} <span style={{ color: faint, fontWeight: 400 }}>· {c.setup_class} · {c.instrument_class} · {c.side}</span>
            </div>
            <div style={{ fontSize: 11, color: dim, margin: '3px 0' }}>{c.entry_rule}</div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ color: dim }}>R:R <b style={{ color: c.computed.rr_passed ? okColor : holdColor }}>{c.computed.rr_ratio}</b></span>
              <span style={{ color: dim }}>Size <b style={{ color: c.computed.size_passed ? okColor : holdColor }}>{c.computed.position_size_qty}</b> (risk ${c.computed.risk_amount})</span>
              <span style={{ color: dim }}>Expectancy <b style={{ color: c.computed.expectancy_passed ? okColor : holdColor }}>{c.computed.expectancy_R}R</b></span>
              <span style={{ color: faint }}>mode: {c.mode}</span>
            </div>
            <div style={{ fontSize: 10, color: faint, marginTop: 3 }}>{c.calc_note}</div>
          </div>
        ))}
        <div style={{ fontSize: 10, color: faint, marginTop: 8 }}>
          All values computed by <code>trade_calc.py</code> ({strategyLab._meta.all_trade_math_source.split('(')[0].trim()}). No figure reasoned by hand.
        </div>
      </div>

      {/* Survival limits */}
      <div className="chart-card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Survival Limits — H3 FROZEN (5/5/5/50)</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
          {strategyLab.survival_limits.limits.map((l) => (
            <span key={l.key} style={{ color: dim }}>{l.key}: <b style={{ color: 'rgba(255,255,255,0.85)' }}>≤ {l.cap_pct}%</b></span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: faint, marginTop: 8 }}>
          Kill switch held by {strategyLab.survival_limits.kill_switch_holders.join(', ')}. {strategyLab.survival_limits.kill_switch_note}
        </div>
      </div>
    </div>
  );
}

export function Trading({ killActive, mode3Conditions, mode3Enabled, onSend, busActivity, connected, marketContext }) {
  const [activeTab, setActiveTab] = useState('overview');
  const market = normalizeMarketFeed(marketContext);
  const feedState = marketFeedState(market);
  const ticker = Object.entries(market.equities);

  // Filter QUANT-related events from bus activity (display-only)
  const quantEvents = (busActivity || []).filter(e =>
    e.dir === 'quant-to-overseer' || e.dir?.startsWith('webui-to-quant') ||
    e.from === 'QUANT' || e.from === 'STAN'
  );
  const quantProposals = quantEvents.filter(e => e.file?.includes('PROPOSAL') || e.file?.includes('proposal'));

  return (
    <div className="trading-page">
      <div className="dashboard-top-bar">
        <h2 className="dashboard-title">Trading Platform</h2>
        <ControlsCluster
          killActive={killActive}
          mode3Conditions={mode3Conditions}
          mode3Enabled={mode3Enabled}
          onSend={onSend}
        />
      </div>

      {/* Ticker banner */}
      <div className="ticker-banner">
        <div className="ticker-inner">
          {ticker.length ? ticker.map(([symbol, value]) => (
            <span className="ticker-item" key={symbol}>
              <span className="ticker-sym">{symbol}</span>
              <span className="ticker-price">{typeof value === 'object' ? (value.price ?? value.last ?? value.close ?? '—') : value}</span>
              <span className={feedState.state === 'LIVE' ? 'ticker-up' : 'ticker-down'}>{feedState.state}</span>
            </span>
          )) : <span className="ticker-item"><span className="ticker-sym">MARKET FEED</span><span className="ticker-price">No data</span><span className="ticker-down">{feedState.state}</span></span>}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="trading-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`trading-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="stat-cards-row">
        <div className="stat-card"><div className="stat-card-value">0</div><div className="stat-card-label">Open Positions</div></div>
        <div className="stat-card"><div className="stat-card-value">0.00</div><div className="stat-card-label">P&amp;L (USDT)</div></div>
        <div className="stat-card"><div className="stat-card-value">{quantProposals.length || 0}</div><div className="stat-card-label">Proposals</div></div>
        <div className="stat-card"><div className="stat-card-value">0%</div><div className="stat-card-label">Win Rate</div></div>
      </div>

      {/* Tab content */}
      {activeTab === 'strategy' && (
        <StrategyLab mode3Conditions={mode3Conditions} killActive={killActive} />
      )}

      {activeTab !== 'strategy' && (
      <div className="trading-overview-grid" style={{ marginTop: 16 }}>
        <div className="chart-card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Overview</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Portfolio overview and performance metrics. Data loads when QUANT is active.</p>
          {quantEvents.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Recent Activity</p>
              {quantEvents.slice(-5).reverse().map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>{e.from}</span>: {e.preview?.slice(0, 80) || e.file}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="top-performers-card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Top Performers</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>No active positions</p>
        </div>
      </div>
      )}
    </div>
  );
}
