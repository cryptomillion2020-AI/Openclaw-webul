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
import { AgentComms }      from './pages/AgentComms';
import { Trading }         from './pages/Trading';
import AiCityPage          from './pages/AiCityPage';
import { PrivateVault }    from './pages/PrivateVault';
import { TeamResearch }    from './pages/TeamResearch';
import './App.css';

// Channels the dashboard subscribes to on connect
const SUBSCRIBE_CHANNELS = ['kill_switch', 'bus_activity', 'oauth_status', 'mode3'];

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
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
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard {...pageProps} />;
      case 'comms':     return <AgentComms onSend={send} />;
      case 'trading':   return <Trading {...pageProps} />;
      case 'ai-city':   return <AiCityPage />;
      case 'vault':     return <PrivateVault />;
      case 'research':  return <TeamResearch onSend={send} />;
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

      <div className="main-content">
        {renderPage()}

        <footer style={{
          marginTop: 'auto',
          padding: '16px 0 8px',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.25)',
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          OpenClaw Master Workflow · Phase 5 · v3.0
        </footer>
      </div>
    </div>
  );
}
