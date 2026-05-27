/**
 * App.jsx — OpenClaw Master Workflow UI
 * Phase 5 Item 2 — v2.0 (4 control surfaces + websocket backend)
 *
 * Surfaces:
 *   1. Kill Switch        — halt QUANT activity (modal confirmation)
 *   2. Mode 3 Toggle      — inert until Phase 6 Item 6
 *   3. OAuth Status       — auth-mode per agent (placeholder: auth-profiles.json)
 *   4. Agent Status       — live bus activity dashboard
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { KillSwitch }  from './components/KillSwitch';
import { Mode3Toggle } from './components/Mode3Toggle';
import { OAuthStatus } from './components/OAuthStatus';
import { AgentStatus } from './components/AgentStatus';
import './App.css';

// Configurable websocket URL (default: localhost for local staging)
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8765';

// Kill-switch polling interval (ms)
const KILL_POLL_MS = 5000;

export default function App() {
  const [connected,   setConnected]   = useState(false);
  const [killActive,  setKillActive]  = useState(false);
  const [oauthStatus, setOauthStatus] = useState({});
  const [busActivity, setBusActivity] = useState([]);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const wsRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Websocket lifecycle
  // ---------------------------------------------------------------------------
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected to OpenClaw backend');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.warn('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[WS] Disconnected — reconnecting in 3s');
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------
  const handleMessage = useCallback((msg) => {
    setLastUpdate(new Date().toISOString());

    if (msg.type === 'full_state') {
      setKillActive(msg.kill_switch || false);
      setOauthStatus(msg.oauth_status || {});
      setBusActivity(msg.bus_activity || []);
    } else if (msg.type === 'kill_switch_update') {
      setKillActive(msg.active);
    } else if (msg.type === 'bus_activity_delta') {
      setBusActivity(prev => {
        const combined = [...prev, ...(msg.events || [])];
        // Deduplicate by file path, keep latest
        const seen = new Map();
        combined.forEach(e => { if (!seen.has(e.file) || seen.get(e.file).mtime < e.mtime) seen.set(e.file, e); });
        return [...seen.values()].sort((a, b) => a.mtime - b.mtime).slice(-50);
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Kill-switch poll (5s — belt-and-suspenders in case WS misses an update)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'request_full_state' }));
      }
    }, KILL_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // Send helper
  // ---------------------------------------------------------------------------
  const sendWs = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Cannot send — not connected');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="app">
      <header className="app-header">
        <h1>🦅 OpenClaw Master Workflow</h1>
        <div className="header-status">
          <span className={`ws-indicator ${connected ? 'ws-connected' : 'ws-disconnected'}`}>
            {connected ? '🟢 Live' : '🔴 Offline'}
          </span>
          {lastUpdate && (
            <span className="last-update">
              Updated {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <main className="dashboard-grid">
        {/* Surface 1 — Kill Switch */}
        <KillSwitch active={killActive} onSend={sendWs} />

        {/* Surface 2 — Mode 3 Toggle (inert) */}
        <Mode3Toggle />

        {/* Surface 3 — OAuth Status */}
        <OAuthStatus oauthStatus={oauthStatus} />

        {/* Surface 4 — Agent Status Dashboard */}
        <AgentStatus busActivity={busActivity} connected={connected} />
      </main>

      <footer className="app-footer">
        <span>OpenClaw Master Workflow · Phase 5 · v2.0</span>
        <span className="footer-note">
          Production deploy requires Architect credential session — see PHASE-5-WEBUI-DEPLOY.md
        </span>
      </footer>
    </div>
  );
}
