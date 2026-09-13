/**
 * BacktestUploadPanel.jsx — PART B of directive 20260912-160705.
 * Upload TradingView Strategy Tester exports (or a manual self-reported summary) for a specific
 * strategy VERSION. Shows the ingest lifecycle + provenance for prior runs of this version.
 *
 * Safety / honesty:
 *  - Uploads raw file bytes to the authenticated same-origin ingest route; the SERVER stores the
 *    immutable original + hash + parsed projection. This component never executes file content.
 *  - A screenshot / PDF is explicitly labeled NOT trade-level evidence by the server; surfaced here.
 *  - Manual summary is explicitly labeled self-reported.
 *  - Lifecycle states + provenance come from the server (real), never a fabricated ETA.
 */
import { useState, useEffect, useCallback } from 'react';

const ACCEPT = '.csv,.txt,.png,.jpg,.jpeg,.webp,.pdf,.xlsx';
const F = (v) => (v == null || v === '' ? 'UNKNOWN' : v);

export function BacktestUploadPanel({ strategyHash, strategyVersion }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [runs, setRuns] = useState({ status: 'idle', list: [] });

  const loadRuns = useCallback(async () => {
    if (!strategyHash) return;
    setRuns(prev => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch(`/api/research/backtest/runs?strategy_hash=${encodeURIComponent(strategyHash)}`, { credentials: 'same-origin' });
      if (!res.ok) { setRuns({ status: 'error', list: [] }); return; }
      const data = await res.json();
      setRuns({ status: 'ready', list: data.runs || [] });
    } catch { setRuns({ status: 'offline', list: [] }); }
  }, [strategyHash]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const upload = async () => {
    if (!file || busy) return;
    setBusy(true); setMsg(null);
    try {
      const q = new URLSearchParams({
        strategy_hash: strategyHash || '', strategy_version: strategyVersion || '',
        filename: file.name, kind: 'auto',
      });
      const res = await fetch(`/api/research/backtest/upload?${q}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ err: true, text: `Rejected (${data.error || res.status})${data.detail ? ': ' + data.detail : ''}` }); }
      else {
        const cls = data.provenance?.evidence_class;
        const n = data.parsed?.trade_count;
        setMsg({ err: false, text: `${data.idempotent ? 'Already ingested' : 'Received'} · ${cls}${n != null ? ` · ${n} trades parsed` : ''} · state ${data.lifecycle?.state}` });
        setFile(null); loadRuns();
      }
    } catch (e) { setMsg({ err: true, text: `Upload failed: ${e.message || e}` }); }
    finally { setBusy(false); }
  };

  const submitManual = async () => {
    if (!manual.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/research/backtest/manual', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_hash: strategyHash, strategy_version: strategyVersion, summary: manual.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ err: true, text: `Rejected (${data.error || res.status})` });
      else { setMsg({ err: false, text: 'Self-reported summary stored (not trade-level evidence).' }); setManual(''); setShowManual(false); loadRuns(); }
    } catch (e) { setMsg({ err: true, text: `Failed: ${e.message || e}` }); }
    finally { setBusy(false); }
  };

  return (
    <div className="backtest-upload" data-testid="backtest-upload" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
      <div className="bento-card-sub">Backtest results for this version <code style={{ fontSize: 10 }}>{(strategyHash || '').slice(0, 12) || 'UNKNOWN'}</code></div>
      <div className="lab-query-meta" style={{ marginTop: 4 }}>
        Export from your own TradingView <b>Strategy Tester</b> (List of Trades and/or Performance Summary CSV). Uploaded files are stored as inert data and never executed. A screenshot/PDF is stored but is <b>not trade-level evidence</b>.
      </div>

      <div className="composer-row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="file" accept={ACCEPT} onChange={e => setFile(e.target.files?.[0] || null)} aria-label="Backtest export file" />
        <button className="composer-send" onClick={upload} disabled={!file || busy} aria-disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload export'}</button>
        <button className="composer-send" onClick={() => setShowManual(s => !s)} style={{ background: 'transparent' }} disabled={busy}>{showManual ? 'Cancel' : 'No export? Enter summary'}</button>
      </div>

      {showManual && (
        <div style={{ marginTop: 8 }}>
          <textarea className="composer-textarea" placeholder="Self-reported summary (win rate, period, observations). Labeled self-reported — not trade-level evidence." value={manual} onChange={e => setManual(e.target.value)} style={{ minHeight: 70, width: '100%' }} aria-label="Manual summary" />
          <button className="composer-send" onClick={submitManual} disabled={!manual.trim() || busy} style={{ marginTop: 6 }}>Submit self-reported summary</button>
        </div>
      )}

      {msg && <div className="lab-query-meta" style={{ marginTop: 6, color: msg.err ? 'var(--danger,#FF5252)' : '#6a9955' }} role="status">{msg.text}</div>}

      {runs.list.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="bento-card-sub">Ingested runs ({runs.list.length})</div>
          {runs.list.map(r => (
            <div key={r.run_id} className="lab-query-row" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 11 }}>
              <span className={`route-chip stage-${r.state === 'Complete' ? 'verification' : r.state === 'Needs-information' ? 'reference' : 'research'}`} style={{ fontSize: 10, pointerEvents: 'none' }}>{r.state}</span>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>{r.run_id}</span>
              <span className="lab-query-meta">{r.evidence_class}{r.trade_count != null ? ` · ${r.trade_count} trades` : ''}</span>
              <span className="lab-query-meta">{F(r.strategy_version)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
