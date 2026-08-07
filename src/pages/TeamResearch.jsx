/**
 * TeamResearch.jsx — Page 6: Team Research
 * Uses pages.css class names — 12-agent pool with routing
 *
 * Data binding (Stage 2, Track 1):
 *   READ:  filters busActivity for research-related events → renders thread
 *   SEND:  onSend({ type: 'research_query', text, routing, selected_agents }) → backend writes bus file
 *
 * A4 (DIRECTIVE-P1-WEBUI-FUNCTIONAL-CRM-20260806): request intake → agent
 * assignment → result return is now visible per-query via query_id-grouped
 * cards (see groupByQuery below). Citation gate is enforced server-side
 * (webui_websocket_server.py::_scan_research_results) — a reply with no
 * detectable source arrives here as a research_result_blocked event and
 * renders as a withheld notice, never as an unsourced claim. Backend also
 * writes every cited result to workspace/knowledge/<topic>/webui-research/
 * and runs an advisory (non-blocking) dedup check against prior queries.
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

// Stage badge copy + tone for a query card. Keeps the pipeline (intake →
// assignment → result) visible at every point rather than only on completion.
const STAGE_META = {
  dispatched:          { label: 'Awaiting result', color: '#FFC107' },
  complete:            { label: 'Result received', color: '#4CAF50' },
  blocked_no_citation: { label: 'Withheld — no citation', color: '#F44336' },
};

export function TeamResearch({ onSend, busActivity, connected }) {
  const [routingMode, setRoutingMode] = useState(0);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [message, setMessage] = useState('');
  const [threadMessages, setThreadMessages] = useState([]);
  const [queryCards, setQueryCards] = useState([]);
  const threadEndRef = useRef(null);

  // Toggle agent selection
  const toggleAgent = (agentId) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  // Filter busActivity for research-related events not tied to a tracked
  // query_id (legacy chatter — SEVIN/STAN/QUANT posts, other RESEARCH/
  // PROPOSAL files not routed through the query pipeline).
  useEffect(() => {
    if (!busActivity || !Array.isArray(busActivity)) return;
    const researchEvents = busActivity
      .filter(e =>
        !e.query_id && (
          e.dir?.startsWith('webui-to-') ||
          e.file?.includes('RESEARCH') ||
          e.file?.includes('PROPOSAL') ||
          e.from === 'SEVIN' || e.from === 'STAN' || e.from === 'QUANT'
        )
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

  // Group query_id-tagged events into per-query pipeline cards: intake
  // (research_delta, stage=dispatched) + result (research_result /
  // research_result_blocked). Request → assignment → result is visible at
  // every stage, not just on completion.
  useEffect(() => {
    if (!busActivity || !Array.isArray(busActivity)) return;
    const byId = new Map();
    busActivity
      .filter(e => e.query_id)
      .sort((a, b) => a.mtime - b.mtime)
      .forEach(e => {
        const existing = byId.get(e.query_id) || { query_id: e.query_id };
        if (e.stage === 'dispatched' && e.preview !== undefined && e.routing !== undefined) {
          // intake event
          byId.set(e.query_id, {
            ...existing,
            queryText: e.preview,
            routing: e.routing,
            selectedAgents: e.selected_agents,
            ts: e.ts,
            dedup: e.dedup || null,
            stage: existing.stage || 'dispatched',
          });
        } else if (e.resultType) {
          // result / blocked event supersedes the dispatched stage
          byId.set(e.query_id, {
            ...existing,
            stage: e.stage,
            from: e.from,
            resultPreview: e.preview,
            sources: e.sources || [],
            artifactPath: e.artifact_path,
            reason: e.reason,
            resultTs: e.ts,
          });
        }
      });
    setQueryCards([...byId.values()].sort((a, b) => new Date(a.ts) - new Date(b.ts)));
  }, [busActivity]);

  // Auto-scroll
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, queryCards]);

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
            {queryCards.length === 0 && threadMessages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔬</div>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Select agent(s) and send a research query</p>
              </div>
            ) : (
              <>
                {queryCards.map((q) => {
                  const stageMeta = STAGE_META[q.stage] || STAGE_META.dispatched;
                  return (
                    <div key={q.query_id} className="thread-message" style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="thread-msg-meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <span className="thread-msg-author" style={{ fontSize: 12, fontWeight: 700 }}>You</span>
                        <span className="thread-msg-time" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{q.ts ? new Date(q.ts).toLocaleTimeString() : ''}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          color: stageMeta.color, border: `1px solid ${stageMeta.color}`,
                        }}>{stageMeta.label}</span>
                      </div>
                      <div className="thread-msg-text" style={{ fontSize: 12, marginTop: 4 }}>{q.queryText}</div>

                      {q.dedup && (
                        <div style={{ fontSize: 11, color: '#FFC107', marginTop: 6, padding: '4px 8px', border: '1px solid rgba(255,193,7,0.3)', borderRadius: 4 }}>
                          ⚠ Similar question researched {q.dedup.age_days}d ago (status: {q.dedup.status}
                          {q.dedup.artifact_path ? `, see ${q.dedup.artifact_path}` : ''}) — dedup is advisory only, proceeding.
                        </div>
                      )}

                      {q.stage === 'complete' && (
                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(76,175,80,0.06)', borderLeft: '2px solid #4CAF50' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{q.from} replied</div>
                          <div style={{ fontSize: 12 }}>{q.resultPreview}</div>
                          {q.sources?.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255,255,255,0.4)' }}>Sources</div>
                              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11 }}>
                                {q.sources.map((s, si) => <li key={si} style={{ wordBreak: 'break-all' }}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                          {q.artifactPath && (
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6, fontFamily: 'monospace' }}>
                              Artifact: {q.artifactPath}
                            </div>
                          )}
                        </div>
                      )}

                      {q.stage === 'blocked_no_citation' && (
                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(244,67,54,0.06)', borderLeft: '2px solid #F44336' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{q.from} replied — withheld</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            No claim without a source: this reply had no detectable citation, so it is not shown as a result.
                            {q.reason ? ` (${q.reason})` : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {threadMessages.map((msg, i) => (
                  <div key={`legacy-${i}`} className="thread-message" style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="thread-msg-meta">
                      <span className="thread-msg-author" style={{ fontSize: 12, fontWeight: 700 }}>{msg.from}</span>
                      <span className="thread-msg-time" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{msg.ts}</span>
                      {msg.dir && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 8 }}>via {msg.dir}</span>}
                    </div>
                    <div className="thread-msg-text" style={{ fontSize: 12, marginTop: 4 }}>{msg.body}</div>
                  </div>
                ))}
              </>
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
