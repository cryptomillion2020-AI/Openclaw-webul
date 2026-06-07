/**
 * TeamResearch.jsx — Page 6: Team Research
 * Uses pages.css class names — 12-agent pool with routing
 *
 * Data binding (Stage 2, Track 1):
 *   READ:  filters busActivity for research-related events → renders thread
 *   SEND:  onSend({ type: 'research_query', text, routing, selected_agents }) → backend writes bus file
 */

import { useState, useEffect, useRef } from 'react';

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

// Map bus directory names to research target
function researchDirLabel(dir) {
  const map = {
    'webui-to-sevin':       'SEVIN',
    'webui-to-all-agents':  'Broadcast',
    'webui-to-research':    'Research Pool',
  };
  return map[dir] || dir;
}

export function TeamResearch({ onSend, busActivity, connected }) {
  const [routingMode, setRoutingMode] = useState(0);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [message, setMessage] = useState('');
  const [threadMessages, setThreadMessages] = useState([]);
  const threadEndRef = useRef(null);

  // Toggle agent selection
  const toggleAgent = (agentId) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  // Filter busActivity for research-related events
  useEffect(() => {
    if (!busActivity || !Array.isArray(busActivity)) return;
    const researchEvents = busActivity
      .filter(e =>
        e.dir?.startsWith('webui-to-') ||
        e.file?.includes('RESEARCH') ||
        e.file?.includes('PROPOSAL') ||
        e.from === 'SEVIN' || e.from === 'STAN' || e.from === 'QUANT'
      )
      .map(e => ({
        from: e.from || 'System',
        ts:   e.ts ? new Date(e.ts).toLocaleTimeString() : '',
        body: e.preview || e.body || '(no content)',
        dir:  researchDirLabel(e.dir),
        mtime: e.mtime || 0,
      }))
      .sort((a, b) => a.mtime - b.mtime);
    setThreadMessages(researchEvents);
  }, [busActivity]);

  // Auto-scroll
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  // Send handler
  const handleSend = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.({
      type: 'research_query',
      text: trimmed,
      routing: routingMode,
      selected_agents: selectedAgents,
    });
    setMessage('');
  };

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
            style={{ borderColor: selectedAgents.includes(agent.id) ? agent.color : 'rgba(255,255,255,0.1)', cursor: 'pointer' }}
            onClick={() => toggleAgent(agent.id)}>
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
            {threadMessages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔬</div>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Select agent(s) and send a research query</p>
              </div>
            ) : (
              threadMessages.map((msg, i) => (
                <div key={i} className="thread-message" style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="thread-msg-meta">
                    <span className="thread-msg-author" style={{ fontSize: 12, fontWeight: 700 }}>{msg.from}</span>
                    <span className="thread-msg-time" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{msg.ts}</span>
                    {msg.dir && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 8 }}>via {msg.dir}</span>}
                  </div>
                  <div className="thread-msg-text" style={{ fontSize: 12, marginTop: 4 }}>{msg.body}</div>
                </div>
              ))
            )}
            <div ref={threadEndRef} />
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
                  if (e.key === 'Enter') {
                    handleSend(e.target.value);
                  }
                }}
              />
              <button className="research-send-btn" onClick={() => handleSend(message)}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
