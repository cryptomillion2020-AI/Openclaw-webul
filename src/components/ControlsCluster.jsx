/**
 * ControlsCluster.jsx — Operative PAPER control bar.
 *
 * DIRECTIVE 20260912-190423 Work Items A + C:
 *   A. The former "Kill Switch" button sent an optimistic WebSocket `kill_switch_activate`
 *      that only *halted QUANT*. That was the wrong semantics. This bar now drives the REAL
 *      server-side emergency PAPER close-all state machine over HTTP:
 *        POST /api/trading/paper/kill/activate   — deterministic backend close-all + entry latch
 *        GET  /api/trading/paper/kill/status      — the backend-ACK'd latch (source of truth)
 *        POST /api/trading/paper/kill/resume      — SEPARATE deliberate unlock ({confirm:'RESUME PAPER'})
 *      "KILL ACTIVE" is shown ONLY after the backend ACKs the latch — never optimistically.
 *      Activation is deliberate (an inline two-click arm) but uses NO blocking modal, so an
 *      emergency stop is never delayed. Resume is a separate, deliberate confirmation.
 *      Running counts (cancelled / closed / failed / unresolved) + the latest confirmed state
 *      and measured completion time are surfaced from the backend result/status.
 *   C. Mode 3 was a gated paper-mode control from the pre-PAPER-ONLY era (it toggled
 *      `mode3_confirm` via the WebSocket). Under PAPER-ONLY it is inert and misleading, so the
 *      toggle is REMOVED from the operative bar and replaced with an accurate PAPER-ONLY status.
 *      No `mode3_confirm` mutation is emitted from here; the backend real-money/mode3 denial is
 *      untouched. `mode3*` props are accepted for call-site compatibility and intentionally unused.
 *
 * Sound (mute) toggle is wholly separate from the emergency control and unchanged in behaviour.
 * Uses inline styles + App.css modal classes.
 */

import { useState, useEffect, useCallback } from 'react';
import { soundManager } from '../lib/soundManager';

const human = s => String(s).replaceAll('_', ' ');

const styles = {
  cluster: { display: 'flex', gap: 8, alignItems: 'center' },
  btn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 10,
    border: 'none', cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans',sans-serif",
    fontSize: 12, fontWeight: 600,
    transition: 'all 0.2s ease',
  },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 },
};

// Same-origin paper API helper (mirrors PaperControls.jsx): no cached/inferred value; a coded
// error body is surfaced verbatim so an auth-expiry never reads as success.
async function killApi(route, body) {
  let r;
  try {
    r = await fetch('/api/trading/paper/kill/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (transport) { const e = Error('network_unreachable'); e.cause = transport; throw e; }
  let b; try { b = await r.json(); } catch { const e = Error(r.ok ? 'malformed_response' : 'kill_api_unavailable'); e.httpStatus = r.status; throw e; }
  if (!r.ok) { const e = Error(b.error || 'kill_api_unavailable'); e.httpStatus = r.status; e.code = b.error; throw e; }
  return b;
}

export function ControlsCluster({ killActive, mode3Conditions, mode3Enabled, onSend }) { // eslint-disable-line no-unused-vars
  // Backend latch is the source of truth — never an optimistic local toggle.
  const [kill, setKill] = useState(null);   // last status/activate/resume result from the server
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState(false); // inline two-click arm (deliberate, no blocking modal)
  const [showResume, setShowResume] = useState(false);
  const [clientAckMs, setClientAckMs] = useState(null); // measured request→ACK round-trip
  const [soundsMuted, setSoundsMuted] = useState(soundManager.isMuted());

  useEffect(() => soundManager.onMuteChange(setSoundsMuted), []);

  const loadStatus = useCallback(async () => {
    try { setKill(await killApi('status')); setErr(''); }
    catch (e) { setErr(human(e.message)); }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Auto-disarm the activation button after a short window so it can't stay armed indefinitely.
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);

  const state = kill?.state ?? 'inactive';
  const locked = !!kill?.locked;
  const unresolved = state === 'kill_active_unresolved';
  const counts = kill?.counts ?? null;

  const activate = useCallback(async () => {
    if (busy) return;
    setBusy(true); setErr(''); setArmed(false);
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    try {
      const r = await killApi('activate', {}); // deterministic server-side close-all; backend-ACK'd
      setClientAckMs(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0));
      setKill(r);
    } catch (e) { setErr(human(e.message)); await loadStatus(); }
    finally { setBusy(false); }
  }, [busy, loadStatus]);

  const doResume = useCallback(async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = await killApi('resume', { confirm: 'RESUME PAPER' }); // SEPARATE deliberate confirmation
      setKill(r); setShowResume(false); setClientAckMs(null);
    } catch (e) { setErr(human(e.message)); }
    finally { setBusy(false); }
  }, [busy]);

  const stopBtnStyle = {
    ...styles.btn,
    background: locked ? 'linear-gradient(310deg, #f53939, #c62828)' : (armed ? '#c62828' : 'rgba(245,57,57,0.12)'),
    color: locked || armed ? '#fff' : '#f53939',
    border: locked || armed ? 'none' : '1px solid rgba(245,57,57,0.3)',
    boxShadow: locked || armed ? '0 3px 8px rgba(245,57,57,0.4)' : 'none',
    opacity: busy ? 0.6 : 1,
  };

  const stateLabel = locked
    ? (unresolved ? 'KILL ACTIVE · UNRESOLVED' : 'KILL ACTIVE')
    : (state === 'inactive' ? 'Ready' : human(state));

  return (
    <>
      <div className="controls-cluster" style={{ ...styles.cluster, flexWrap: 'wrap' }}>
        <span aria-label="Paper simulation only" style={{ fontSize: 11, fontWeight: 700, color: '#edc087' }}>PAPER ONLY · NO REAL MONEY</span>

        {/* Work Item A — the real emergency close-all, backend-ACK'd. Not "halt QUANT". */}
        {!locked ? (
          <button
            style={stopBtnStyle}
            disabled={busy}
            onClick={() => (armed ? activate() : setArmed(true))}
            title="Immediately cancel all pending paper orders and close all open paper positions"
            data-testid="kill-stop"
            data-armed={armed ? 'yes' : 'no'}
          >
            <span>{busy ? 'Stopping…' : armed ? 'Confirm — STOP & close all' : 'Stop & close all paper trades'}</span>
          </button>
        ) : (
          <>
            <span
              data-testid="kill-state"
              style={{
                ...styles.btn, cursor: 'default',
                background: unresolved ? 'rgba(245,57,57,0.18)' : 'linear-gradient(310deg,#f53939,#c62828)',
                color: '#fff', border: unresolved ? '1px solid rgba(245,57,57,0.5)' : 'none',
              }}
            >
              <span>{stateLabel}</span>
            </span>
            {unresolved && (
              <button style={{ ...styles.btn, background: 'rgba(245,57,57,0.12)', color: '#f53939', border: '1px solid rgba(245,57,57,0.3)' }}
                disabled={busy} onClick={activate} data-testid="kill-retry" title="Retry the emergency close-all with current market data">
                <span>{busy ? 'Retrying…' : 'Retry close-all'}</span>
              </button>
            )}
            <button style={{ ...styles.btn, background: 'rgba(1,181,116,0.15)', color: '#01B574', border: '1px solid rgba(1,181,116,0.3)' }}
              disabled={busy} onClick={() => setShowResume(true)} data-testid="kill-resume-open" title="Lift the entry lock (separate deliberate confirmation)">
              <span>Resume paper trading</span>
            </button>
          </>
        )}

        {/* Work Item B — mute toggle carries a dedicated class so its icon-only "Sound" label
            cannot bleed onto the modal/action buttons via the .cc-controls ::after rule. */}
        <button
          className="cc-mute"
          style={{
            ...styles.btn,
            background: soundsMuted ? 'rgba(255,255,255,0.05)' : 'rgba(1,181,116,0.15)',
            color: soundsMuted ? 'rgba(255,255,255,0.4)' : '#01B574',
            border: soundsMuted ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(1,181,116,0.3)',
          }}
          onClick={() => soundManager.toggle()}
          title={soundsMuted ? 'Enable UI sounds' : 'Mute UI sounds'}
        >
          <span>{soundsMuted ? '🔇' : '🔊'}</span>
        </button>
      </div>

      {/* Running counts + latest confirmed state (surfaced from the backend, not inferred). */}
      {(counts || err) && (
        <div data-testid="kill-counts" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          {err && <span role="alert" style={{ color: '#f53939' }}>Kill control: {err}. No ledger state inferred. </span>}
          {counts && (
            <span>
              State <strong>{human(state)}</strong> · cancelled {counts.cancelled}/{counts.pending_found} · closed {counts.closed}/{counts.positions_found}
              {counts.cancel_failed ? ` · cancel-failed ${counts.cancel_failed}` : ''}
              {counts.close_unresolved ? ` · unresolved ${counts.close_unresolved}` : ''}
              {kill?.remaining ? ` · remaining pending ${kill.remaining.pending}/open ${kill.remaining.open}` : ''}
              {kill?.data_blocker ? ` · blocker: ${human(kill.data_blocker)}` : ''}
              {typeof kill?.completion_ms === 'number' ? ` · completed in ${kill.completion_ms}ms` : ''}
              {typeof clientAckMs === 'number' ? ` · ack ${clientAckMs}ms` : ''}
            </span>
          )}
        </div>
      )}

      {showResume && (
        <div className="modal-overlay" onClick={() => setShowResume(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginBottom: 8 }}>Resume paper trading?</h4>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
              This only lifts the entry lock so new paper trades can be placed again. It does <strong>NOT</strong> reopen
              any cancelled order or closed position, and does <strong>NOT</strong> auto-create any entry.
            </p>
            <div style={styles.modalActions}>
              <button className="btn" disabled={busy} onClick={doResume}
                style={{ background: 'linear-gradient(310deg,#01B574,#00d09c)', color: '#fff', boxShadow: '0 3px 8px rgba(1,181,116,0.4)' }}>
                {busy ? 'Resuming…' : 'Confirm resume'}
              </button>
              <button className="btn" onClick={() => setShowResume(false)}
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
