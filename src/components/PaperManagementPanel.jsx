/**
 * PaperManagementPanel.jsx — PART C of directive 20260912-160705 (read-only surface).
 * Surfaces the deterministic PAPER trade-protection engine's manager state per bracket:
 * state · confirmed levels · observed data age · last check · trigger outcome · disclosures.
 *
 * Safety / honesty:
 *  - PAPER ONLY. This panel shows simulated protective state; there is NO real-order path.
 *  - Levels, states, ages, and trigger fills are read from the server engine (deterministic CODE),
 *    never invented in the UI. Missing values render as UNKNOWN.
 *  - A simulated stop is NOT a guaranteed exact fill — the engine's disclosures are surfaced verbatim.
 *  - Existing positions without a confirmed bracket are unprotected/needs-levels, never retro-assigned.
 */
import { useState, useEffect, useCallback } from 'react';

const F = (v) => (v == null || v === '' ? 'UNKNOWN' : v);
const STATE_STAGE = {
  'confirmed/active': 'verification', proposed: 'research', triggered: 'reference',
  closed: 'reference', 'stale/unmanaged': 'research', cancelled: 'reference', unprotected: 'research',
};
const ageStr = (ms) => (ms == null ? 'UNKNOWN' : ms < 1000 ? `${ms}ms` : `${Math.round(ms / 100) / 10}s`);

export function PaperManagementPanel() {
  const [data, setData] = useState({ status: 'loading', brackets: [], error: null });

  const load = useCallback(async () => {
    setData(prev => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/research/paper-mgmt/brackets', { credentials: 'same-origin' });
      if (res.status === 401) { setData({ status: 'unauthenticated', brackets: [], error: null }); return; }
      if (!res.ok) { setData({ status: 'error', brackets: [], error: `HTTP ${res.status}` }); return; }
      const j = await res.json();
      setData({ status: 'ready', brackets: j.brackets || [], error: null });
    } catch (e) { setData({ status: 'offline', brackets: [], error: String(e && e.message || e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="bento-card lab-paper-mgmt" data-testid="paper-mgmt-panel">
      <div className="bento-card-label">Paper trade protection — manager state (read-only, PAPER)</div>
      <div className="lab-query-meta" style={{ marginTop: 4 }}>
        Simulated protective brackets. <b>No real orders</b> are placed. A simulated stop is <b>not</b> a guaranteed exact fill (gap/slippage modeled). Positions without a confirmed bracket are shown <b>unprotected / needs levels</b> and are never retro-assigned protection.
      </div>

      {data.status === 'loading' && <div className="lab-query-meta" role="status">Loading protection state…</div>}
      {data.status === 'unauthenticated' && <div className="lab-query-meta">Sign in to view protection state.</div>}
      {(data.status === 'offline' || data.status === 'error') && (
        <div className="lab-query-meta" style={{ color: 'var(--danger,#FF5252)' }}>
          {data.status === 'offline' ? 'Offline' : `Error (${data.error})`} — protection state unavailable.
          <button className="composer-send" style={{ marginLeft: 8 }} onClick={load}>Retry</button>
        </div>
      )}
      {data.status === 'ready' && data.brackets.length === 0 && <div className="lab-query-meta" style={{ marginTop: 8 }}>No protective brackets. Existing positions remain unprotected until confirmed levels are supplied.</div>}

      {data.status === 'ready' && data.brackets.map(b => (
        <div key={b.trade_id} className="lab-query-row" style={{ marginTop: 8, padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`route-chip stage-${STATE_STAGE[b.state] || 'research'}`} style={{ fontSize: 10, pointerEvents: 'none' }}>{b.state}</span>
            <span style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>{F(b.symbol)} · {b.side === 'buy' ? 'LONG' : 'SHORT'} · {F(b.quantity)}</span>
            <span className="lab-query-meta">{F(b.strategy?.name)} {F(b.strategy?.version)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 12px', marginTop: 6 }}>
            <div>entry: <b>{F(b.entry)}</b></div>
            <div>stop: <b style={{ color: 'var(--danger,#FF5252)' }}>{F(b.stop)}</b></div>
            <div>target: <b style={{ color: '#6a9955' }}>{F(b.target)}</b></div>
            <div>last check: {b.last_check_ms ? new Date(b.last_check_ms).toLocaleTimeString() : 'UNKNOWN'}</div>
            <div>data age: {ageStr(b.observed_data_age_ms)}</div>
            <div>source: {F(b.quote_source)}</div>
          </div>
          {b.triggered && (
            <div className="lab-query-meta" style={{ marginTop: 4 }}>
              triggered <b>{b.triggered.leg}</b> @ {F(b.triggered.fill_price)} — {b.triggered.reason}{b.triggered.gap ? ' (gap)' : ''}{b.triggered.both_touched ? ' (both-touched → stop-first)' : ''}
            </div>
          )}
          {b.state === 'stale/unmanaged' && <div className="lab-query-meta" style={{ marginTop: 4, color: 'var(--danger,#FF5252)' }}>⚠ paused — market data stale/invalid. Automatic simulated mutations are suspended.</div>}
          {Array.isArray(b.disclosures) && b.disclosures.map((d, i) => <div key={i} className="lab-query-meta" style={{ marginTop: 2, fontSize: 10 }}>· {d}</div>)}
        </div>
      ))}
    </div>
  );
}
