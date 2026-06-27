/**
 * Sidebar.jsx — Vision UI Sidebar
 * Updated to use exact Vision UI Dashboard React CSS class names
 */

import { useState } from 'react';

// Navigation entries
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'comms',     label: 'Agent Comms', icon: '💬' },
  { key: 'trading',   label: 'Trading', icon: '📈' },
  { key: 'ai-city',   label: 'AI-City', icon: '🌆' },
  { key: 'vault',     label: 'Private Vault', icon: '🔒' },
  { key: 'research',  label: 'Research', icon: '🔬' },
];


const isAuthorized = (status) => {
  if (!status) return false;
  if (status === 'connected' || status === 'authorized') return true;
  if (typeof status === 'object') {
    return Boolean(status.auth_mode) && status.auth_mode !== 'none';
  }
  return false;
};

const formatAuthStatus = (status) => {
  if (!status) return 'Not Authorized';
  if (status === 'connected' || status === 'authorized') return 'Authorized';
  if (typeof status === 'object') {
    if (status.vault_carve_out) return 'local_only';
    return status.auth_mode || 'unknown';
  }
  return String(status);
};

export function Sidebar({ currentPage, onNavigate, oauthStatus, connected }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="sidebar-collapse-toggle"
        onClick={() => setCollapsed(v => !v)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">⚡</span>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">SEVIN</span>
          <span className="sidebar-logo-subtitle">System Engineer for Virtual Information Networks</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item${currentPage === item.key ? ' active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="nav-item-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Status Section */}
      <div className="sidebar-status">
        <div className="status-item">
          <span className={`status-dot${connected ? '' : ' offline'}`}></span>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {/* OAuth status dots */}
        {Object.entries(oauthStatus).length > 0 && (
          Object.entries(oauthStatus).map(([provider, status]) => (
            <div className="status-item" key={provider}>
              <span className={`status-dot${isAuthorized(status) ? '' : ' offline'}`}></span>
              <span>{provider}: {formatAuthStatus(status)}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
