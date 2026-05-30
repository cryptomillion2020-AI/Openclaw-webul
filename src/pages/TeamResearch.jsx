/**
 * TeamResearch.jsx — Page 6: Team Research
 * Uses pages.css class names — 12-agent pool with routing
 */

import { useState } from 'react';

const ALL_AGENTS = [
  { id: 'SEVIN', label: 'SEVIN — System Architect', color: '#F57F17' },
  { id: 'OVERSEER', label: 'OVERSEER — Orchestrator', color: '#1565C0' },
  { id: 'ELEVIN', label: 'ELEVIN — Engineering', color: '#1B5E20' },
  { id: 'TIKA', label: 'TIKA — Knowledge', color: '#7B1FA2' },
  { id: 'NAVIGATOR', label: 'NAVIGATOR — Pathfinding', color: '#00BCD4' },
  { id: 'NEXUS', label: 'NEXUS — Discovery', color: '#FFFFFF' },
  { id: 'COMMS', label: 'COMMS — Communication', color: '#00897B' },
  { id: 'COSMOS', label: 'COSMOS — Media', color: '#E91E63' },
  { id: 'STAN', label: 'STAN — Standards', color: '#616161' },
  { id: 'ROOTS', label: 'ROOTS — Memory', color: '#558B2F' },
  { id: 'AXIS', label: 'AXIS — Infrastructure', color: '#E65100' },
  { id: 'QUANT', label: 'QUANT — Finance', color: '#FF6F00' },
];

const ROUTING_MODES = ['Ask SEVIN', 'Select agents', 'Broadcast all'];

export function TeamResearch({ onSend }) {
  const [routingMode, setRoutingMode] = useState(0);
  const [selectedAgents] = useState([]);
  const [message, setMessage] = useState('');

  return (
    <div className="research-page">
      {/* Routing bar */}
      <div className="routing-bar">
        <span className="routing-label">Route to:</span>
        {ROUTING_MODES.map((mode, i) => (
          <button
            key={mode}
            className={`routing-btn${routingMode === i ? ' active' : ''}`}
            onClick={() => setRoutingMode(i)}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Agent selector chips */}
      <div className="agent-selector-chips">
        {ALL_AGENTS.map((agent) => (
          <div
            key={agent.id}
            className={`agent-selector-chip${selectedAgents.includes(agent.id) ? ' active' : ''}`}
            style={{ borderColor: selectedAgents.includes(agent.id) ? agent.color : 'rgba(255,255,255,0.1)' }}
          >
            <span className="agent-dot" style={{ background: agent.color, boxShadow: `0 0 6px ${agent.color}` }} />
            {agent.id}
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="research-main-grid">
        {/* Sessions panel */}
        <div className="sessions-panel">
          <div className="sessions-header">
            <span>Sessions</span>
            <button className="sessions-new-btn">+ New</button>
          </div>
          <div className="sessions-list">
            <div className="session-item active">
              <div className="session-item-title">Current Session</div>
              <div className="session-item-meta">0 messages</div>
            </div>
            <div className="session-item">
              <div className="empty-state-icon" style={{ fontSize: 20, marginRight: 8 }}>💡</div>
              <div>
                <div className="session-item-title">Start a new research thread</div>
                <div className="session-item-meta">Select agents and type a message</div>
              </div>
            </div>
          </div>
        </div>

        {/* Thread area */}
        <div className="research-thread-area">
          <div className="research-thread-messages">
            <div className="empty-state">
              <div className="empty-state-icon">🔬</div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Select agent(s) and send a research query</p>
            </div>
          </div>

          <div className="research-action-bar">
            <button className="research-action-btn action-backtest">📊 Initiate Backtest</button>
            <button className="research-action-btn action-strategy">📝 Request Strategy</button>
            <button className="research-action-btn action-sevin">🤖 Ask SEVIN</button>
          </div>

          <div className="research-input-area">
            <div className="research-input-row">
              <input
                type="text"
                placeholder="Type a research query..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && message.trim()) {
                    onSend?.({ type: 'research_query', text: message.trim(), routing: routingMode });
                    setMessage('');
                  }
                }}
              />
              <button className="research-send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
