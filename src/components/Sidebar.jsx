/**
 * Sidebar.jsx — Phase 4 Global Shell
 * Graphite & Signal muted palette. Live agent rail with status dots.
 * 7-destination IA per 05-PHASE-4-WEBUI-REDESIGN-SPEC.md §3, §4.1.
 *
 * Replaces: workspace-webui/src/components/Sidebar.jsx
 * Filed: 2026-07-05 by ELEVIN (Build Track C, Phase 4)
 */

import { useState } from 'react';

// ── Phase 4 IA — 7 destinations (§3) ──────────────────────────────
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard',  icon: '◈' },
  { key: 'comms',     label: 'Comms',      icon: '◎' },
  { key: 'trading',   label: 'Trading',    icon: '▣' },
  { key: 'research',  label: 'Research',   icon: '◉' },
  { key: 'ai-city',   label: 'AI City',    icon: '◇' },
  { key: 'network',   label: 'Network',    icon: '⊞' },
  { key: 'vault',     label: 'Vault',      icon: '⬡' },
];

// ── Agent state machine (§4.1) — vocabulary crossing ops + city ───
const AGENT_STATES = [
  { agent: 'SEVIN',     state: 'thinking',     model: 'claude-4' },
  { agent: 'OVERSEER',  state: 'monitoring',   model: 'claude-4' },
  { agent: 'ELEVIN',    state: 'building',     model: 'sonnet-4' },
  { agent: 'TIKA',      state: 'researching',  model: 'haiku-3.5' },
  { agent: 'QUANT',     state: 'idle',         model: 'sonnet-4' },
  { agent: 'NEXUS',     state: 'synthesizing', model: 'haiku-3.5' },
  { agent: 'COMMS',     state: 'waiting',      model: 'haiku-3.5' },
  { agent: 'AXIS',      state: 'idle',         model: 'haiku-3.5' },
  { agent: 'COSMOS',    state: 'idle',         model: 'sonnet-4' },
  { agent: 'NAVIGATOR', state: 'idle',         model: 'haiku-3.5' },
  { agent: 'STAN',      state: 'thinking',     model: 'claude-4' },
  { agent: 'VAULT',     state: 'idle',         model: 'haiku-3.5' },
  { agent: 'SAGE',      state: 'monitoring',   model: 'haiku-3.5' },
];

// ── Status dot color mapping ──────────────────────────────────────
const STATE_COLORS = {
  'thinking':     'var(--status-active)',
  'building':     'var(--status-active)',
  'researching':  'var(--status-active)',
  'monitoring':   'var(--status-active)',
  'synthesizing': 'var(--status-active)',
  'waiting':      'var(--status-pending)',
  'idle':         'var(--status-idle)',
};

function statusColor(state) {
  return STATE_COLORS[state] || 'var(--status-offline)';
}

// ── OAuth helpers (preserved from P3) ─────────────────────────────
function isAuthorized(status) {
  if (!status) return false;
  if (status === 'connected' || status === 'authorized') return true;
  if (typeof status === 'object')
    return Boolean(status.auth_mode) && status.auth_mode !== 'none';
  return false;
}

function formatAuthStatus(status) {
  if (!status) return 'Not Authorized';
  if (status === 'connected' || status === 'authorized') return 'Authorized';
  if (typeof status === 'object') {
    if (status.vault_carve_out) return 'local_only';
    return status.auth_mode || 'unknown';
  }
  return String(status);
}

// ═══════════════════════════════════════════════════════════════════
// Sidebar component
// ═══════════════════════════════════════════════════════════════════
export function Sidebar({ currentPage, onNavigate, oauthStatus, connected }) {
  const [collapsed, setCollapsed] = useState(false);

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
    <aside className="sidebar sidebar-p4">
      {/* ── Collapse toggle ── */}
      <button
        className="sidebar-collapse-toggle"
        onClick={() => setCollapsed(true)}
        title="Hide sidebar"
        aria-label="Hide sidebar"
      >
        ‹
      </button>

      {/* ── Logo / Title ── */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">◆</span>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">OpenClaw</span>
          <span className="sidebar-logo-subtitle">Operations Console</span>
        </div>
      </div>

      {/* ── Navigation (§3 IA — 7 destinations) ── */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item${currentPage === item.key ? ' active' : ''}`}
            onClick={() => onNavigate(item.key)}
            aria-current={currentPage === item.key ? 'page' : undefined}
            aria-label={`Navigate to ${item.label}`}
          >
            <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-item-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Live agent rail (§4.1) — status dots + state ── */}
      <div className="sidebar-agent-rail">
        <div className="agent-rail-header">AGENTS</div>
        <div className="agent-rail-list">
          {AGENT_STATES.map((a) => (
            <div key={a.agent} className="agent-rail-entry">
              <span
                className="agent-status-dot"
                style={{ color: statusColor(a.state) }}
                aria-hidden="true"
              >
                ●
              </span>
              <span className="agent-name">{a.agent}</span>
              <span className="agent-state">{a.state}</span>
              <span className="agent-model">{a.model}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Connection status ── */}
      <div className="sidebar-status">
        <div className="status-item">
          <span
            className="status-dot"
            style={{ color: connected ? 'var(--status-active)' : 'var(--status-offline)' }}
          >
            ●
          </span>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {Object.entries(oauthStatus).length > 0 &&
          Object.entries(oauthStatus).map(([provider, status]) => (
            <div className="status-item" key={provider}>
              <span
                className="status-dot"
                style={{ color: isAuthorized(status) ? 'var(--status-active)' : 'var(--status-offline)' }}
              >
                ●
              </span>
              <span>{provider}: {formatAuthStatus(status)}</span>
            </div>
          ))}
      </div>
    </aside>
  );
}

export default Sidebar;
