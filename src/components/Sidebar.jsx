/**
 * Sidebar.jsx — Vision UI Sidebar
 * Updated to use exact Vision UI Dashboard React CSS class names
 */

import { useState } from 'react';

// Navigation entries — Pass 3 nav with SVG icons from public/nav/
// Labels: only Dashboard→Bridge rebranded now (Bridge is built). Other pages
// keep current labels until their phase redesign (P3.2 Markets / P3.3 Network
// / P3.4 Lab / P3.5 Vault). Rebrand happens with each page redesign per Pass 3 SPEC §4.
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Bridge',        iconSrc: '/nav/bridge.svg' },
  { key: 'comms',     label: 'Agent Comms',   iconSrc: '/nav/network.svg' },
  { key: 'trading',   label: 'Trading',       iconSrc: '/nav/markets.svg' },
  { key: 'ai-city',   label: 'AI-City',       iconSrc: '/nav/ai-city.svg' },
  { key: 'vault',     label: 'Private Vault', iconSrc: '/nav/vault.svg' },
  { key: 'research',  label: 'Research',      iconSrc: '/nav/lab.svg' },
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

  // When collapsed: render only the toggle button (sidebar fully hidden)
  if (collapsed) {
    return (
      <button
        className="sidebar-show-toggle"
        onClick={() => setCollapsed(false)}
        title="Show sidebar"
        aria-label="Show sidebar"
      >
        ›
      </button>
    );
  }

  return (
    <aside className="sidebar">
      <button
        className="sidebar-collapse-toggle"
        onClick={() => setCollapsed(true)}
        title="Hide sidebar"
        aria-label="Hide sidebar"
      >
        ‹
      </button>
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">⚡</span>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">SEVIN</span>
          <span className="sidebar-logo-subtitle">System Engineer for Virtual Information Networks</span>
        </div>
      </div>

      {/* Navigation — SVG icons + ARIA accessibility per UI concepts ingestion */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item${currentPage === item.key ? ' active' : ''}`}
            onClick={() => onNavigate(item.key)}
            aria-current={currentPage === item.key ? 'page' : undefined}
            aria-label={`Navigate to ${item.label}`}
          >
            <span className="nav-item-icon" aria-hidden="true">
              <img src={item.iconSrc} alt="" width="20" height="20" style={{ display: 'block' }} />
            </span>
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
