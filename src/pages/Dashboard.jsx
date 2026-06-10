/**
 * Dashboard.jsx — Page 1: Main Dashboard
 * Uses pages.css class names
 */

import { ControlsCluster } from '../components/ControlsCluster';
import { AgentStatus } from '../components/AgentStatus';
import { OAuthStatus } from '../components/OAuthStatus';

// Wave 4c: status → display class + label for project/phase/task chips.
const STATUS_LABEL = {
  in_progress: 'In Progress',
  blocked:     'Blocked',
  done:        'Done',
  pending:     'Pending',
};
function statusColor(s) {
  if (s === 'done')        return '#4ade80';
  if (s === 'in_progress') return '#60a5fa';
  if (s === 'blocked')     return '#f87171';
  return 'rgba(255,255,255,0.4)';
}

export function Dashboard({
  killActive,
  mode3Conditions,
  mode3Enabled,
  onSend,
  busActivity,
  connected,
  oauthStatus,
  tasks,
  activeProjects = [],
  activeTasks = [],
}) {
  // Active Tasks rendered: only in-progress + blocked; map project_id → title.
  const projectTitleById = Object.fromEntries((activeProjects || []).map(p => [p.id, p.title]));
  const openProjects = (activeProjects || []).filter(p => p.status === 'in_progress' || p.status === 'blocked');
  const openTasks    = (activeTasks    || []).filter(t => t.status === 'in_progress' || t.status === 'blocked');
  return (
    <div className="dashboard-page">
      {/* Top bar */}
      <div className="dashboard-top-bar">
        <h2 className="dashboard-title">Main Dashboard</h2>
        <div className="dashboard-controls">
          <ControlsCluster
            killActive={killActive}
            mode3Conditions={mode3Conditions}
            mode3Enabled={mode3Enabled}
            onSend={onSend}
          />
        </div>
      </div>

      {/* Stat cards row */}
      <div className="stat-cards-row">
        <div className="stat-card">
          <div className="stat-card-value">13</div>
          <div className="stat-card-label">Agents</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{tasks ? tasks.filter(t => t.status === 'active' || t.status === 'pending').length : 0}</div>
          <div className="stat-card-label">Active Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{tasks ? tasks.filter(t => t.status === 'complete').length : 0}</div>
          <div className="stat-card-label">Complete</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{busActivity?.length || 0}</div>
          <div className="stat-card-label">Bus Events</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="dashboard-main-grid">
        {/* Agent status */}
        <div className="agent-status-card">
          <div className="section-header">
            <span className="section-title">Agent Status</span>
            <span className="section-count">{busActivity?.length || 0} events</span>
          </div>
          <AgentStatus busActivity={busActivity} connected={connected} />
        </div>

        {/* OAuth Status */}
        <div className="agent-status-card">
          <div className="section-header">
            <span className="section-title">OAuth Status</span>
          </div>
          <OAuthStatus oauthStatus={oauthStatus} />
        </div>
      </div>

      {/* Bottom grid */}
      <div className="dashboard-bottom-grid">
        <div className="bottom-card">
          <div className="section-header">
            <span className="section-title">📁 Active Projects</span>
            <span className="section-count">{openProjects.length}</span>
          </div>
          {openProjects.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '8px 0' }}>No active projects</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
              {openProjects.map(p => (
                <div key={p.id} style={{
                  padding: 10,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', fontWeight: 500 }}>{p.title}</span>
                    <span style={{ fontSize: 11, color: statusColor(p.status) }}>{STATUS_LABEL[p.status] || p.status}</span>
                  </div>
                  {p.progress != null && (
                    <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${p.progress}%`, height: '100%', background: statusColor(p.status) }} />
                    </div>
                  )}
                  {Array.isArray(p.phases) && p.phases.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.phases.map((ph, i) => (
                        <span key={i} title={`${ph.name}: ${STATUS_LABEL[ph.status] || ph.status}`} style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 3,
                          color: statusColor(ph.status),
                          background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${statusColor(ph.status)}33`,
                        }}>
                          {ph.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bottom-card">
          <div className="section-header">
            <span className="section-title">📊 Active Trades</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '8px 0' }}>No active trades</p>
        </div>
        <div className="bottom-card">
          <div className="section-header">
            <span className="section-title">🔔 Priority Messages</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '8px 0' }}>No unread priority messages</p>
        </div>
      </div>

      {/* Active Tasks — all in-progress tasks (project-attached + standalone) */}
      <div className="bottom-card" style={{ marginTop: 16 }}>
        <div className="section-header">
          <span className="section-title">📌 Active Tasks</span>
          <span className="section-count">{openTasks.length}</span>
        </div>
        {openTasks.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '8px 0' }}>No active tasks</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
            {openTasks.map(t => {
              const projTitle = t.project_id ? (projectTitleById[t.project_id] || '<unknown project>') : null;
              return (
                <div key={t.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      {projTitle ? `project: ${projTitle} · ` : 'standalone · '}assignee: {t.assignee || '—'}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: statusColor(t.status), whiteSpace: 'nowrap' }}>{STATUS_LABEL[t.status] || t.status}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
