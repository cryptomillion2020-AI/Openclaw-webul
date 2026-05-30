/**
 * Header.jsx — Site-wide header with navigation icon rail + OAuth dot row
 * Phase 5 FE-01 — Proposal 5
 *
 * Renders on every page. Includes:
 *   - Logo (home link)
 *   - Navigation icon rail (6 pages + logout)
 *   - 13-dot OAuth status row (compact ambient indicators)
 *   - WebSocket connection status
 */

const AGENTS = [
  'SEVIN', 'OVERSEER', 'ELEVIN', 'TIKA', 'QUANT', 'NAVIGATOR',
  'COSMOS', 'AXIS', 'COMMS', 'NEXUS', 'ROOTS', 'STAN', 'VAULT',
];

const NAV_ITEMS = [
  { page: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { page: 'comms',     icon: '💬', label: 'Comms' },
  { page: 'trading',   icon: '📈', label: 'Trading' },
  { page: 'ai-city',   icon: '🏙️', label: 'AI-City' },
  { page: 'vault',     icon: '🔐', label: 'VAULT' },
  { page: 'research',  icon: '🔬', label: 'Research' },
];

export function Header({
  currentPage = 'dashboard',
  onNavigate,
  oauthStatus = {},
  connected = false,
}) {
  return (
    <header className="site-header">
      {/* Logo */}
      <div className="header-logo" onClick={() => onNavigate?.('dashboard')}>
        <span className="logo-icon">🦅</span>
        <span className="logo-text">OpenClaw</span>
      </div>

      {/* Navigation icon rail */}
      <nav className="icon-rail">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.page}
            className={`icon-rail-btn ${currentPage === item.page ? 'icon-rail-active' : ''}`}
            onClick={() => onNavigate?.(item.page)}
            title={item.label}
          >
            <span className="icon-rail-icon">{item.icon}</span>
          </button>
        ))}
      </nav>

      {/* OAuth ambient dot row — 13 agents */}
      <div className="oauth-dots-row" title="Per-agent OAuth status">
        {AGENTS.map((agent) => {
          const status = oauthStatus[agent]?.auth_mode || 'unknown';
          const statusClass = status === 'authenticated' ? 'dot-ok'
            : status === 'vault' || status === 'vault_only' ? 'dot-vault'
            : status === 'fallback' ? 'dot-fallback'
            : 'dot-unknown';
          return (
            <span
              key={agent}
              className={`oauth-dot ${statusClass}`}
              title={`${agent}: ${status}`}
            />
          );
        })}
      </div>

      {/* Connection status */}
      <div className="header-ws-status">
        <span className={`ws-dot ${connected ? 'ws-dot-on' : 'ws-dot-off'}`} />
        <span className="ws-label">{connected ? 'Live' : 'Offline'}</span>
      </div>
    </header>
  );
}
