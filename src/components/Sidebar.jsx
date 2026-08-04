/**
 * Sidebar.jsx — Phase 4 Global Shell
 * Graphite & Signal muted palette. Live agent rail with status dots.
 * 7-destination IA per 05-PHASE-4-WEBUI-REDESIGN-SPEC.md §3, §4.1.
 *
 * Replaces: workspace-webui/src/components/Sidebar.jsx
 * Filed: 2026-07-05 by ELEVIN (Build Track C, Phase 4)
 */

import { useMemo, useState } from 'react';
import { isCurrentlyActiveTask } from '../lib/task-helpers';
import { getAgentRuntime } from '../lib/agent-runtime';

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
const AGENT_IDS = ['SEVIN', 'OVERSEER', 'ELEVIN', 'TIKA', 'QUANT', 'NEXUS', 'COMMS', 'AXIS', 'COSMOS', 'NAVIGATOR', 'STAN', 'ROOTS', 'VAULT', 'SAGE'];

// ── Status dot color mapping ──────────────────────────────────────
const STATE_COLORS = {
  'thinking':     'var(--status-active)',
  'building':     'var(--status-active)',
  'researching':  'var(--status-active)',
  'monitoring':   'var(--status-active)',
  'synthesizing': 'var(--status-active)',
  'waiting':      'var(--status-pending)',
  'idle':         'var(--status-idle)',
  'in progress':  'var(--status-active)',
  'active':       'var(--status-active)',
  'pending':      'var(--status-pending)',
  'blocked':      'var(--status-pending)',
  'done':         'var(--status-idle)',
  'complete':     'var(--status-idle)',
  'no active task': 'var(--status-idle)',
};

function statusColor(state) {
  return STATE_COLORS[state] || 'var(--status-offline)';
}

function representativeTaskRank(task) {
  if (isCurrentlyActiveTask(task?.status)) return 3;
  if (task?.status === 'done' || task?.status === 'complete' || task?.status === 'closed') return 2;
  if (task?.status === 'pending') return 1;
  return 0;
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
export function Sidebar({ currentPage, onNavigate, oauthStatus, connected, tasks = [], activeTasks = [] }) {
  const [collapsed, setCollapsed] = useState(false);
  const agentRows = useMemo(() => {
    const selected = new Map();
    [...(Array.isArray(activeTasks) ? activeTasks : []), ...(Array.isArray(tasks) ? tasks : [])].forEach(task => {
      let agent = String(task.assignee ?? task.agentId ?? '').toUpperCase();
      if (agent === 'MAIN') agent = 'SEVIN';
      if (!AGENT_IDS.includes(agent)) return;
      const current = selected.get(agent);
      if (!current || representativeTaskRank(task) > representativeTaskRank(current)) selected.set(agent, task);
    });
    return AGENT_IDS.map(agent => {
      const task = selected.get(agent);
      const runtime = getAgentRuntime(agent);
      return {
        agent,
        state: task?.status ? String(task.status).replaceAll('_', ' ') : 'no active task',
        task: task?.title || task?.label || 'No task reported',
        substrate: runtime?.runtime || 'Runtime unavailable',
        model: runtime?.shortModel || 'Model unavailable',
      };
    });
  }, [activeTasks, tasks]);

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
    <aside className={`sidebar sidebar-p4${currentPage === 'ai-city' ? ' sidebar--aicity' : ''}`}>
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
          <span className="sidebar-logo-name">SEVIN</span>
          <span className="sidebar-logo-subtitle">System engineer for virtual information networks</span>
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
          {agentRows.map((a) => (
            <div key={a.agent} className="agent-rail-entry" title={a.task}>
              <span
                className="agent-status-dot"
                style={{ color: statusColor(a.state) }}
                aria-hidden="true"
              >
                ●
              </span>
              <span className="agent-name">{a.agent}</span>
              <span className="agent-state">{a.state}</span>
              <span className="agent-substrate">{a.substrate}</span>
              <span className="agent-model">model {a.model}</span>
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
