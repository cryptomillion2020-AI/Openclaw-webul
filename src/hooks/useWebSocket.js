/**
 * useWebSocket.js — WebSocket hook with channel multiplexing, exponential backoff,
 * heartbeat detection, and same-origin transport isolation.
 *
 * Phase 5 FE-01 — Proposal 3 implementation
 *
 * Replaces inline WebSocket logic in App.jsx with a reusable hook.
 * Supports channel subscription: clients subscribe to only the event channels
 * they need, reducing bandwidth and re-renders.
 *
 * Usage:
 *   const { connected, subscribe, send } = useWebSocket({
 *     onMessage: (msg) => { ... },
 *     channels: ['kill_switch', 'bus_activity', 'oauth_status', 'mode3'],
 *   });
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// Config. Production uses the same browser origin and Vite reverse-proxies
// /ws to the loopback-only backend. This keeps backend credentials out of the
// JavaScript bundle and works on loopback, raw Tailnet, and Tailscale Serve.
function resolveWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

// Reconnect delays (exponential backoff)
const BASE_DELAY   = 1000;   // 1s
const MAX_DELAY    = 30000;  // 30s cap
const BACKOFF_MULT = 2;

// Heartbeat
const HEARTBEAT_INTERVAL = 15000;  // 15s server ping interval
const HEARTBEAT_TIMEOUT  = 20000;  // 20s without message → reconnect

/**
 * @param {Object} options
 * @param {Function} options.onMessage - Callback for every parsed WS message
 * @param {string[]} options.channels - Channels to subscribe to on connect
 * @param {boolean} options.autoConnect - Auto-connect on mount (default: true)
 */
export function useWebSocket({
  onMessage = () => {},
  channels = [],
  autoConnect = true,
} = {}) {
  const [connected, setConnected] = useState(false);
  const wsRef           = useRef(null);
  const attemptRef      = useRef(0);
  const timerRef        = useRef(null);
  const heartbeatRef    = useRef(null);
  const lastMsgRef      = useRef(Date.now());
  const onMessageRef    = useRef(onMessage);
  const channelsRef     = useRef(channels);
  const autoConnectRef  = useRef(autoConnect);

  // Keep callback ref fresh without recreating the connect function
  onMessageRef.current   = onMessage;
  channelsRef.current    = channels;
  autoConnectRef.current = autoConnect;

  // ---------------------------------------------------------------------------
  // Heartbeat monitor (client-side)
  // ---------------------------------------------------------------------------
  const startHeartbeat = useCallback(() => {
    const check = () => {
      const elapsed = Date.now() - lastMsgRef.current;
      if (elapsed > HEARTBEAT_TIMEOUT && wsRef.current) {
        console.warn(`[WS] No message for ${elapsed}ms — reconnecting`);
        wsRef.current.close();
      }
    };
    heartbeatRef.current = setInterval(check, HEARTBEAT_INTERVAL);
  }, []);

  // ---------------------------------------------------------------------------
  // Connect with exponential backoff
  // ---------------------------------------------------------------------------
  const connect = useCallback(() => {
    if (wsRef.current && [WebSocket.OPEN, WebSocket.CONNECTING].includes(wsRef.current.readyState)) return;

    const ws = new WebSocket(resolveWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      clearInterval(heartbeatRef.current);
      setConnected(true);
      attemptRef.current = 0;
      lastMsgRef.current = Date.now();

      // Subscribe to requested channels
      if (channelsRef.current.length > 0) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          channels: channelsRef.current,
        }));
      }

      startHeartbeat();
    };

    ws.onmessage = (event) => {
      lastMsgRef.current = Date.now();
      try {
        const msg = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch (e) {
        console.warn('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnected(false);
      clearInterval(heartbeatRef.current);

      if (!autoConnectRef.current) return;

      // Exponential backoff reconnect
      const delay = Math.min(
        BASE_DELAY * Math.pow(BACKOFF_MULT, attemptRef.current),
        MAX_DELAY
      );
      attemptRef.current += 1;
      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attemptRef.current})`);
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    };
  }, [startHeartbeat]);

  // ---------------------------------------------------------------------------
  // Send helper
  // ---------------------------------------------------------------------------
  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    console.warn('[WS] Cannot send — not connected');
    return false;
  }, []);

  // ---------------------------------------------------------------------------
  // Subscribe helper (dynamic)
  // ---------------------------------------------------------------------------
  const subscribe = useCallback((newChannels) => {
    channelsRef.current = newChannels;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channels: newChannels }));
    }
  }, []);

  // Per-feed recovery does not tear down the shared socket: doing so would let
  // one failed feed interrupt every healthy feed. Re-announce the affected
  // subscription and request a canonical snapshot instead.
  const reconnectFeed = useCallback((channel) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify({ type: 'subscribe', channels: [channel] }));
    wsRef.current.send(JSON.stringify({ type: 'request_full_state' }));
    return true;
  }, []);

  // Explicit reconnect also replaces a half-open/connecting transport.
  const reconnectNow = useCallback(() => {
    clearTimeout(timerRef.current);
    clearInterval(heartbeatRef.current);
    const previous = wsRef.current;
    wsRef.current = null;
    if (previous) { previous.onclose = null; previous.onerror = null; previous.close(); }
    setConnected(false);
    attemptRef.current = 0;
    connect();
  }, [connect]);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(heartbeatRef.current);
      const previous = wsRef.current;
      wsRef.current = null;
      if (previous) { previous.onclose = null; previous.onerror = null; previous.close(); }
    };
  }, [autoConnect, connect]);

  return { connected, send, subscribe, reconnectFeed, reconnectNow };
}
