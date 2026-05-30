/**
 * AgentStatus.jsx — Agent Status Dashboard
 * Updated to use pages.css class names
 */

const ALL_AGENTS = [
  'SEVIN','OVERSEER','ELEVIN','TIKA','NAVIGATOR',
  'NEXUS','COMMS','COSMOS','STAN','ROOTS','AXIS','QUANT','VAULT',
];

const AGENT_ORDER = { SEVIN:0, OVERSEER:1, ELEVIN:2, TIKA:3, NAVIGATOR:4, NEXUS:5, COMMS:6, COSMOS:7, STAN:8, ROOTS:9, AXIS:10, QUANT:11, VAULT:12 };

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}

export function AgentStatus({ busActivity, connected }) {
  const agentActivity = {};
  (busActivity || []).forEach(event => {
    const agent = event.from;
    if (!agentActivity[agent] || event.mtime > agentActivity[agent].mtime) {
      agentActivity[agent] = event;
    }
  });

  return (
    <div>
      <div className="agents-grid">
        {ALL_AGENTS.map(agent => {
          const activity = agentActivity[agent];
          const hasActivity = !!activity;
          const color = getAgentColor(agent);
          return (
            <div key={agent} className={`agent-chip ${hasActivity ? '' : 'agent-chip-top'}`}>
              <span className="agent-dot" style={{ background: color, boxShadow: hasActivity ? `0 0 8px ${color}` : 'none' }} />
              <span className="agent-chip-name">{agent}</span>
              <span className="agent-chip-status">{hasActivity ? `${relativeTime(activity.ts)}` : '—'}</span>
            </div>
          );
        })}
      </div>

      {/* Recent bus events */}
      <div style={{ marginTop: 12 }}>
        <div className="section-header">
          <span className="section-title">Recent Bus Events</span>
          <span className="section-count">{busActivity?.length || 0} total</span>
        </div>
        {(busActivity || []).length === 0 ? (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '8px 0' }}>
            {connected ? 'No recent events…' : '🔴 Disconnected — showing cached data'}
          </p>
        ) : (
          <div className="priority-panel">
            {[...(busActivity || [])].reverse().slice(0, 8).map((ev, i) => (
              <div key={i} className="priority-message-item">
                <span className="priority-msg-from">{ev.from}</span>
                <span className="priority-msg-time">→ {ev.dir} · {relativeTime(ev.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getAgentColor(agent) {
  const colors = {
    SEVIN: '#F57F17', OVERSEER: '#1565C0', ELEVIN: '#1B5E20',
    TIKA: '#7B1FA2', NAVIGATOR: '#00BCD4', NEXUS: '#FFFFFF',
    COMMS: '#00897B', COSMOS: '#E91E63', STAN: '#616161',
    ROOTS: '#558B2F', AXIS: '#E65100', QUANT: '#FF6F00',
    VAULT: '#37474F',
  };
  return colors[agent] || '#888';
}
