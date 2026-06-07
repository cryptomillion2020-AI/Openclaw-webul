/**
 * Trading.jsx — Page 3: Trading Platform
 * Uses pages.css class names
 */

import { useState } from 'react';
import { ControlsCluster } from '../components/ControlsCluster';

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'charts',     label: 'Live Charts' },
  { id: 'execution',  label: 'Trade Execution' },
  { id: 'strategy',   label: 'Strategy Lab' },
];

export function Trading({ killActive, mode3Conditions, mode3Enabled, onSend, busActivity, connected }) {
  const [activeTab, setActiveTab] = useState('overview');

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
          <span className="ticker-item"><span className="ticker-sym">BTC/USD</span><span className="ticker-price">84,320</span><span className="ticker-up">▲ 2.4%</span></span>
          <span className="ticker-item"><span className="ticker-sym">ETH/USD</span><span className="ticker-price">3,142</span><span className="ticker-down">▼ 1.1%</span></span>
          <span className="ticker-item"><span className="ticker-sym">SOL/USD</span><span className="ticker-price">168.50</span><span className="ticker-up">▲ 5.2%</span></span>
          <span className="ticker-item"><span className="ticker-sym">LINK/USD</span><span className="ticker-price">14.82</span><span className="ticker-up">▲ 0.8%</span></span>
          <span className="ticker-item"><span className="ticker-sym">AVAX/USD</span><span className="ticker-price">32.15</span><span className="ticker-down">▼ 0.3%</span></span>
          <span className="ticker-item"><span className="ticker-sym">BTC/USD</span><span className="ticker-price">84,320</span><span className="ticker-up">▲ 2.4%</span></span>
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
    </div>
  );
}
