/**
 * StaleBanner.jsx — top-of-page banner when WS has been disconnected >30s
 * Pass 2 P1 (2026-06-27)
 */
import { useEffect, useState } from 'react';

const STALE_THRESHOLD_MS = 30_000;

export function StaleBanner({ connected, lastUpdate, onReconnect }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (connected) return null;
  if (!lastUpdate) return null;
  const lastMs = new Date(lastUpdate).getTime();
  if (now - lastMs < STALE_THRESHOLD_MS) return null;

  const secs = Math.round((now - lastMs) / 1000);
  return (
    <div className="stale-banner">
      <span>⚠ Stale — last update {secs}s ago</span>
      {onReconnect && (
        <button className="stale-banner-reconnect" onClick={onReconnect}>
          Reconnect
        </button>
      )}
    </div>
  );
}
