import { useCallback, useEffect, useRef, useState } from 'react';

export const FEED_STATE = Object.freeze({ LIVE: 'LIVE', STALE: 'STALE', DEAD: 'DEAD' });

export function useFeedHealth({ feeds, onReconnect }) {
  const [health, setHealth] = useState(() => Object.fromEntries(
    Object.entries(feeds).map(([id, config]) => [id, {
      id,
      label: config.label,
      expectedCadenceMs: config.expectedCadenceMs,
      lastMessageAt: null,
      state: FEED_STATE.DEAD,
    }]),
  ));
  const reconnects = useRef({});

  const markMessage = useCallback((id, at = Date.now(), expectedCadenceMs = null) => {
    setHealth(previous => {
      const current = previous[id];
      if (!current) return previous;
      reconnects.current[id] = 0;
      return {
        ...previous,
        [id]: {
          ...current,
          expectedCadenceMs: expectedCadenceMs || current.expectedCadenceMs,
          lastMessageAt: at,
          state: FEED_STATE.LIVE,
        },
      };
    });
  }, []);

  const markAllDead = useCallback(() => {
    setHealth(previous => Object.fromEntries(
      Object.entries(previous).map(([id, current]) => [id, { ...current, state: FEED_STATE.DEAD }]),
    ));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setHealth(previous => {
        let changed = false;
        const next = { ...previous };
        Object.entries(previous).forEach(([id, current]) => {
          const config = feeds[id];
          const elapsed = current.lastMessageAt ? now - current.lastMessageAt : Infinity;
          let state = FEED_STATE.LIVE;
          if (elapsed > current.expectedCadenceMs * config.deadMultiplier) state = FEED_STATE.DEAD;
          else if (elapsed > current.expectedCadenceMs * config.staleMultiplier) state = FEED_STATE.STALE;
          if (state === current.state) return;
          changed = true;
          next[id] = { ...current, state };
          if (state !== FEED_STATE.LIVE && (reconnects.current[id] || 0) < config.maxReconnects) {
            reconnects.current[id] = (reconnects.current[id] || 0) + 1;
            onReconnect?.(id, reconnects.current[id]);
          }
        });
        return changed ? next : previous;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [feeds, onReconnect]);

  return { health, markMessage, markAllDead };
}
