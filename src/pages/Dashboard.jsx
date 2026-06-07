/**
 * Dashboard.jsx — Page 1: Main Dashboard
 * Uses pages.css class names
 */

import { ControlsCluster } from '../components/ControlsCluster';
import { AgentStatus } from '../components/AgentStatus';
import { OAuthStatus } from '../components/OAuthStatus';

export function Dashboard({
  killActive,
  mode3Conditions,
  mode3Enabled,
  onSend,
  busActivity,
  connected,
  oauthStatus,
  tasks,
}) {
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
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '8px 0' }}>No active projects</p>
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
    </div>
  );
}
