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

export function Trading({ killActive, mode3Conditions, mode3Enabled, onSend }) {
  const [activeTab, setActiveTab] = useState('overview');

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
        <div className="stat-card"><div className="stat-card-value">0</div><div className="stat-card-label">Proposals</div></div>
        <div className="stat-card"><div className="stat-card-value">0%</div><div className="stat-card-label">Win Rate</div></div>
      </div>

      {/* Tab content */}
      <div className="trading-overview-grid" style={{ marginTop: 16 }}>
        <div className="chart-card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Overview</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Portfolio overview and performance metrics. Data loads when QUANT is active.</p>
        </div>
        <div className="top-performers-card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Top Performers</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>No active positions</p>
        </div>
      </div>
    </div>
  );
}
