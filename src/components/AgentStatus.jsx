/**
 * AgentStatus.jsx — Agent Status Dashboard
 * Phase 5 Item 2 — Surface 4
 *
 * Shows recent bus activity for all 13 agents.
 * Live updates via websocket from webui_websocket_server.py.
 */

const ALL_AGENTS = [
  'SEVIN','OVERSEER','ELEVIN','TIKA','NAVIGATOR',
  'NEXUS','COMMS','COSMOS','STAN','ROOTS','AXIS','QUANT','VAULT',
];

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}

export function AgentStatus({ busActivity, connected }) {
  // Build per-agent last-seen map from bus activity
  const agentActivity = {};
  (busActivity || []).forEach(event => {
    const agent = event.from;
    if (!agentActivity[agent] || event.mtime > agentActivity[agent].mtime) {
      agentActivity[agent] = event;
    }
  });

  return (
    <div className="surface-card agent-status-surface">
      <h3>🤖 Agent Status</h3>
      <p className="surface-subtitle">
        {connected
          ? '🟢 Live bus activity stream'
          : '🔴 Websocket disconnected — showing cached data'}
      </p>

      <div className="agent-grid">
        {ALL_AGENTS.map(agent => {
          const activity = agentActivity[agent];
          const hasActivity = !!activity;
          return (
            <div key={agent} className={`agent-card ${hasActivity ? 'agent-active' : 'agent-idle'}`}>
              <div className="agent-card-name">{agent}</div>
              {hasActivity ? (
                <>
                  <div className="agent-card-time" title={activity.ts}>
                    {relativeTime(activity.ts)}
                  </div>
                  <div className="agent-card-task" title={activity.file}>
                    {activity.file.replace(/^\d+-/, '').replace('.md','').slice(0,30)}
                  </div>
                </>
              ) : (
                <div className="agent-card-idle">No recent activity</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent activity log */}
      <div className="activity-log">
        <h4>Recent Bus Events</h4>
        {(busActivity || []).length === 0 ? (
          <p className="loading-text">No recent events…</p>
        ) : (
          <ul className="event-list">
            {[...(busActivity || [])].reverse().slice(0, 10).map((ev, i) => (
              <li key={i} className="event-item">
                <span className="event-agent">{ev.from}</span>
                <span className="event-dir"> → {ev.dir}</span>
                <span className="event-time"> · {relativeTime(ev.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
