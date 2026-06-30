/**
 * App.jsx — OpenClaw Master Workflow UI
 * Vision UI Dashboard React exact implementation
 *
 * Pages:
 *   1. Dashboard    — Main dashboard (stat cards, agent grid, OAuth table)
 *   2. Agent Comms  — MS Teams-style channel communication
 *   3. Trading      — Trading platform (4 sub-tabs, fixed ControlsCluster)
 *   4. AI-City      — HARD-BLOCKED (requires COSMOS sprites + SEVIN sign-off)
 *   5. Private VAULT— Secure agent vault
 *   6. Team Research— 12-agent non-VAULT research pool
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket }   from './hooks/useWebSocket';
import { Sidebar }         from './components/Sidebar';
import { Dashboard }       from './pages/Dashboard';
import { Bridge }          from './pages/Bridge';
import { AgentComms }      from './pages/AgentComms';
import { Trading }         from './pages/Trading';
import AiCityPage          from './pages/AiCityPage';
import { PrivateVault }    from './pages/PrivateVault';
import { TeamResearch }    from './pages/TeamResearch';
import { StaleBanner }    from './components/StaleBanner';
import { ArchitectMenu }  from './components/ArchitectMenu';
import { PageTransition } from './components/PageTransition';
import './App.css';

// Channels the dashboard subscribes to on connect
const SUBSCRIBE_CHANNELS = ['kill_switch', 'bus_activity', 'oauth_status', 'mode3'];

// Wave 4b-A: per-channel comms ring buffer cap
const COMMS_RING_LIMIT = 200;

// Wave 4b-A: bus-dir → comms-channel fallback (used only when msg.channel absent).
// Mapping preserved verbatim from prior AgentComms-internal helper.
function dirToCommsChannel(dir) {
  const map = {
    'webui-to-sevin':       'sevin',
    'webui-to-overseer':    'overseer',
    'webui-to-elevin':      'elevin',
    'webui-to-all-agents':  'all-agents',
    'webui-to-architect':   'architect',
    'webui-to-system':      'system',
    'webui-to-monitoring':  'oauth-failures',
    'webui-to-quant':       'quant-signals',
    'elevin-to-overseer':   'overseer',
    'overseer-to-sevin':    'sevin',
    'sevin-to-overseer':    'overseer',
    'quant-to-overseer':    'quant-signals',
    'stan-to-overseer':     'overseer',
    'discord-outbound':     'deployments',
  };
  return map[dir] || null;
}

// Wave 4b-A: single shape for all comms_delta consumers
function normalizeCommsDelta(msg) {
  return {
    file:            msg.file,
    dir:             msg.dir,
    from:            msg.from || 'WEBUI',
    mtime:           msg.mtime || (msg.ts ? Date.parse(msg.ts) / 1000 : Date.now() / 1000),
    ts:              msg.ts,
    preview:         msg.body,
    channel:         msg.channel || dirToCommsChannel(msg.dir),
    clientMessageId: msg.clientMessageId || null,
    pending:         false,
  };
}

export default function App() {
  // Pass 3 rebrand: URL aliases for page renames (Architect 2026-06-27)
  // /bridge → dashboard, /markets → trading, /lab → research, /network → comms
  // UI labels stay original in P3.0; rebrand UI in P3.1+
  const ROUTE_ALIASES = {
    'bridge':  'dashboard',
    'markets': 'trading',
    'lab':     'research',
    'network': 'comms',
  };
  // Initialize page from URL query param (e.g., ?page=ai-city or ?page=bridge)
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      let page = params.get('page');
      // Apply Pass 3 alias mapping
      if (page && ROUTE_ALIASES[page]) page = ROUTE_ALIASES[page];
      const validPages = ['dashboard', 'bridge', 'comms', 'trading', 'ai-city', 'vault', 'research'];
      if (page && validPages.includes(page)) {
        return page;
      }
    }
    return 'dashboard';
  });
  const [killActive,      setKillActive]      = useState(false);
  const [mode3Conditions, setMode3Conditions] = useState({
    kill_switch_inactive: false,
    paper_mode_confirmed: false,
    stan_audit_passed:    false,
    quant_proposal_approved: false,
    architect_authorized: false,
  });
  const [mode3Enabled,    setMode3Enabled]    = useState(false);
  const [oauthStatus,     setOauthStatus]     = useState({});
  const [busActivity,     setBusActivity]     = useState([]);
  const [commsByChannel,  setCommsByChannel]  = useState({});
  const [tasks,           setTasks]           = useState([]);
  // Wave 4c: Dashboard Active Projects + Active Tasks panels, fed by the
  // active-projects registry (shared/state/active-projects.json) via WS deltas.
  const [activeProjects, setActiveProjects]   = useState([]);
  const [activeTasks,    setActiveTasks]      = useState([]);
  const [lastUpdate,      setLastUpdate]      = useState(null);

  // ---------------------------------------------------------------------------
  // Message handler (passed to useWebSocket)
  // ---------------------------------------------------------------------------
  const handleMessage = useCallback((msg) => {
    setLastUpdate(new Date().toISOString());

    if (msg.type === 'full_state') {
      setKillActive(msg.kill_switch || false);
      setMode3Conditions(msg.mode3_conditions || {
        kill_switch_inactive: false,
        paper_mode_confirmed: false,
        stan_audit_passed:    false,
        quant_proposal_approved: false,
        architect_authorized: false,
      });
      setMode3Enabled(msg.mode3_enabled || false);
      setOauthStatus(msg.oauth_status || {});
      setBusActivity(msg.bus_activity || []);
      setTasks(msg.tasks || []);
      setActiveProjects(msg.active_projects || []);
      setActiveTasks(msg.active_tasks || []);
      // Wave 4c: seed per-channel Comms scrollback so the AgentComms page
      // renders historical messages immediately on connect.
      if (msg.comms_history && typeof msg.comms_history === 'object') {
        const seeded = {};
        Object.entries(msg.comms_history).forEach(([channel, events]) => {
          if (!Array.isArray(events)) return;
          seeded[channel] = events
            .map(e => normalizeCommsDelta({ ...e, channel }))
            .sort((a, b) => a.mtime - b.mtime)
            .slice(-COMMS_RING_LIMIT);
        });
        setCommsByChannel(prev => {
          // Merge: seeded values prefill empty channels; live deltas
          // already accumulated stay (dedup by file+dir against incoming).
          const merged = { ...seeded };
          Object.entries(prev).forEach(([ch, existing]) => {
            const incoming = merged[ch] || [];
            const seenKeys = new Set(incoming.map(e => `${e.dir}::${e.file}`));
            const carry = existing.filter(e => !seenKeys.has(`${e.dir}::${e.file}`));
            merged[ch] = [...incoming, ...carry]
              .sort((a, b) => a.mtime - b.mtime)
              .slice(-COMMS_RING_LIMIT);
          });
          return merged;
        });
      }
    } else if (msg.type === 'active_projects_delta') {
      setActiveProjects(msg.active_projects || []);
      setActiveTasks(msg.active_tasks || []);
    } else if (msg.type === 'task_update') {
      // Merge changed tasks into existing tasks array
      setTasks(prev => {
        const updated = [...prev];
        (msg.tasks || []).forEach(updatedTask => {
          const idx = updated.findIndex(t => t.id === updatedTask.id);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], ...updatedTask };
          } else {
            updated.push(updatedTask);
          }
        });
        return updated;
      });
    } else if (msg.type === 'kill_switch_update') {
      setKillActive(msg.active);
    } else if (msg.type === 'mode3_conditions_update') {
      setMode3Conditions(msg.mode3_conditions || {});
      setMode3Enabled(msg.mode3_enabled || false);
    } else if (msg.type === 'mode3_confirm_error') {
      console.warn('[Mode3] Confirm error:', msg.error);
    } else if (msg.type === 'bus_activity_delta') {
      setBusActivity(prev => {
        const combined = [...prev, ...(msg.events || [])];
        const seen = new Map();
        combined.forEach(e => { if (!seen.has(e.file) || seen.get(e.file).mtime < e.mtime) seen.set(e.file, e); });
        return [...seen.values()].sort((a, b) => a.mtime - b.mtime).slice(-50);
      });
    } else if (msg.type === 'comms_delta') {
      // Immediate Comms message broadcast (includes full body)
      const event = normalizeCommsDelta(msg);
      // Backwards-compat: keep busActivity in sync for non-Comms consumers
      setBusActivity(prev => {
        if (prev.some(e => e.file === event.file && e.dir === event.dir)) return prev;
        const compatEvent = {
          file: event.file, dir: event.dir, from: event.from,
          mtime: event.mtime, ts: event.ts, preview: event.preview,
          channel: event.channel,
        };
        return [...prev, compatEvent].sort((a, b) => a.mtime - b.mtime).slice(-50);
      });
      // Per-channel ring with pending-echo reconciliation
      const channel = event.channel;
      if (channel) {
        setCommsByChannel(prev => {
          const existing = prev[channel] || [];
          // Server-event dedup by (file, dir) — drop second copy of same bus file
          if (existing.some(e => !e.pending && e.file === event.file && e.dir === event.dir)) {
            return prev;
          }
          // Reconcile with pending echo: prefer clientMessageId match, fall back to exact body
          const pendingIdx = existing.findIndex(e =>
            e.pending && (
              (event.clientMessageId && e.clientMessageId === event.clientMessageId) ||
              (e.preview === event.preview)
            )
          );
          let next;
          if (pendingIdx !== -1) {
            next = [...existing];
            next[pendingIdx] = event;
          } else {
            next = [...existing, event];
          }
          next.sort((a, b) => a.mtime - b.mtime);
          if (next.length > COMMS_RING_LIMIT) next = next.slice(-COMMS_RING_LIMIT);
          return { ...prev, [channel]: next };
        });
      }
    } else if (msg.type === 'research_delta') {
      // Immediate Research query broadcast (includes full text)
      const event = {
        file:    msg.file,
        dir:     msg.dir,
        from:    msg.from || 'WEBUI',
        mtime:   msg.mtime || (Date.parse(msg.ts) / 1000),
        ts:      msg.ts,
        preview: msg.text,
        routing: msg.routing,
        selected_agents: msg.selected_agents,
      };
      setBusActivity(prev => {
        if (prev.some(e => e.file === msg.file && e.dir === msg.dir)) return prev;
        return [...prev, event].sort((a, b) => a.mtime - b.mtime).slice(-50);
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // WebSocket hook
  // ---------------------------------------------------------------------------
  const { connected, send } = useWebSocket({
    onMessage: handleMessage,
    channels: SUBSCRIBE_CHANNELS,
    autoConnect: true,
  });

  // ---------------------------------------------------------------------------
  // Wave 4b-A: local-echo enqueue for AgentComms
  // ---------------------------------------------------------------------------
  const addLocalEcho = useCallback((channel, body, clientMessageId) => {
    if (!channel || !body) return;
    const now = Date.now() / 1000;
    const echo = {
      file:            `pending-${clientMessageId}`,
      dir:             'webui-pending',
      from:            'You',
      mtime:           now,
      ts:              new Date(now * 1000).toISOString(),
      preview:         body,
      channel,
      clientMessageId,
      pending:         true,
    };
    setCommsByChannel(prev => {
      const existing = prev[channel] || [];
      let next = [...existing, echo];
      next.sort((a, b) => a.mtime - b.mtime);
      if (next.length > COMMS_RING_LIMIT) next = next.slice(-COMMS_RING_LIMIT);
      return { ...prev, [channel]: next };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Kill-switch poll (5s — belt-and-suspenders)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      send({ type: 'request_full_state' });
    }, 5000);
    return () => clearInterval(timer);
  }, [send]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const pageProps = {
    killActive,
    mode3Conditions,
    mode3Enabled,
    onSend: send,
    busActivity,
    connected,
    oauthStatus,
    tasks,
    activeProjects,
    activeTasks,
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Bridge {...pageProps} />;
      case 'bridge':    return <Bridge {...pageProps} />;
      case 'comms':     return <AgentComms onSend={send} busActivity={busActivity} connected={connected} commsByChannel={commsByChannel} addLocalEcho={addLocalEcho} />;
      case 'trading':   return <Trading {...pageProps} />;
      case 'ai-city':   return <AiCityPage />;
      case 'vault':     return <PrivateVault />;
      case 'research':  return <TeamResearch onSend={send} busActivity={busActivity} connected={connected} />;
      default:          return <Dashboard {...pageProps} />;
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="app-layout">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        oauthStatus={oauthStatus}
        connected={connected}
      />

      <StaleBanner
        connected={connected}
        lastUpdate={lastUpdate}
        onReconnect={() => window.location.reload()}
      />

      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
          <ArchitectMenu
            onSettings={() => setCurrentPage('settings')}
            onLogout={() => window.location.href = '/cdn-cgi/access/logout'}
          />
        </div>
        <PageTransition pageKey={currentPage}>
          {renderPage()}
        </PageTransition>

        <footer style={{
          marginTop: 'auto',
          padding: '16px 0 8px',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.25)',
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          OpenClaw · Pass 3 · Sevin Solutions
        </footer>
      </div>
    </div>
  );
}
