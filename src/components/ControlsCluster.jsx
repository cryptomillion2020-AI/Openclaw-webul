/**
 * ControlsCluster.jsx — Compact kill-switch + Mode 3 control bar
 * Uses inline styles + App.css modal classes
 */

import { useState } from 'react';

const styles = {
  cluster: {
    display: 'flex', gap: 8, alignItems: 'center',
  },
  btn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 10,
    border: 'none', cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans',sans-serif",
    fontSize: 12, fontWeight: 600,
    transition: 'all 0.2s ease',
  },
  modalActions: {
    display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16,
  },
  confirmInput: {
    width: '100%', padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    color: '#fff', fontSize: 14,
    fontFamily: "'Plus Jakarta Sans',sans-serif",
    outline: 'none',
  },
};

export function ControlsCluster({ killActive, mode3Conditions, mode3Enabled, onSend }) {
  const [showKillModal, setShowKillModal] = useState(false);
  const [deactivateModal, setDeactivateModal] = useState(false);
  const [showMode3Modal, setShowMode3Modal] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const allMet = mode3Conditions &&
    Object.values(mode3Conditions).filter(v => typeof v === 'boolean').every(v => v === true);
  const isMode3Active = mode3Conditions?.paper_mode_confirmed === true && allMet;

  const handleKillClick = () => killActive ? setDeactivateModal(true) : setShowKillModal(true);
  const confirmKill = () => { onSend({ type: 'kill_switch_activate' }); setShowKillModal(false); };
  const confirmDeactivate = () => { onSend({ type: 'kill_switch_deactivate' }); setDeactivateModal(false); };

  const handleMode3Click = () => {
    if (isMode3Active) { onSend({ type: 'mode3_condition_update', key: 'paper_mode_confirmed', value: false }); return; }
    if (allMet) { setTypedConfirm(''); setConfirmError(''); setShowMode3Modal(true); }
  };

  const handleConfirmSubmit = () => {
    if (typedConfirm === 'CONFIRM') {
      onSend({ type: 'mode3_confirm', confirm_string: 'CONFIRM' });
      setShowMode3Modal(false); setTypedConfirm(''); setConfirmError('');
    } else {
      setConfirmError('Must type exactly: CONFIRM (case-sensitive)');
    }
  };

  const killBtnStyle = {
    ...styles.btn,
    background: killActive
      ? 'linear-gradient(310deg, #f53939, #c62828)'
      : 'rgba(245,57,57,0.12)',
    color: killActive ? '#fff' : '#f53939',
    border: killActive ? 'none' : '1px solid rgba(245,57,57,0.3)',
    boxShadow: killActive ? '0 3px 8px rgba(245,57,57,0.4)' : 'none',
  };

  const mode3BtnStyle = {
    ...styles.btn,
    background: isMode3Active
      ? 'linear-gradient(310deg, #7928CA, #FF0080)'
      : allMet
        ? 'rgba(1,181,116,0.15)'
        : 'rgba(255,255,255,0.05)',
    color: isMode3Active ? '#fff' : allMet ? '#01B574' : 'rgba(255,255,255,0.4)',
    border: isMode3Active
      ? 'none'
      : allMet
        ? '1px solid rgba(1,181,116,0.3)'
        : '1px solid rgba(255,255,255,0.08)',
    boxShadow: isMode3Active ? '0 3px 5px rgba(121,40,202,0.4)' : 'none',
  };

  return (
    <>
      <div className="controls-cluster" style={styles.cluster}>
        <button style={killBtnStyle} onClick={handleKillClick} title={killActive ? 'Deactivate' : 'Halt QUANT'}>
          <span>⛔</span>
          <span>{killActive ? 'KILL ACTIVE' : 'Kill Switch'}</span>
        </button>
        <button style={mode3BtnStyle} onClick={handleMode3Click} title={isMode3Active ? 'Deactivate' : allMet ? 'Ready' : 'Locked'}>
          <span>📊</span>
          <span>{isMode3Active ? 'Mode 3 ON' : 'Mode 3'}</span>
        </button>
      </div>

      {showKillModal && (
        <div className="modal-overlay" onClick={() => setShowKillModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginBottom: 8 }}>⚠ Confirm Kill Switch</h4>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>This will halt ALL QUANT activity immediately. Are you sure?</p>
            <div style={styles.modalActions}>
              <button className="btn btn-kill" onClick={confirmKill}>Yes, halt QUANT</button>
              <button className="btn" onClick={() => setShowKillModal(false)} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deactivateModal && (
        <div className="modal-overlay" onClick={() => setDeactivateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginBottom: 8 }}>Deactivate Kill Switch?</h4>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>QUANT activity will resume.</p>
            <div style={styles.modalActions}>
              <button className="btn" onClick={confirmDeactivate} style={{ background: 'linear-gradient(310deg,#01B574,#00d09c)', color: '#fff', boxShadow: '0 3px 8px rgba(1,181,116,0.4)' }}>Deactivate</button>
              <button className="btn" onClick={() => setDeactivateModal(false)} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showMode3Modal && (
        <div className="modal-overlay" onClick={() => { setShowMode3Modal(false); setConfirmError(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginBottom: 8 }}>✍️ Confirm Mode 3 Activation</h4>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
              Type <strong>CONFIRM</strong> (case-sensitive) to activate Mode 3 paper trading.
            </p>
            <input type="text" placeholder="Type CONFIRM..." value={typedConfirm}
              onChange={(e) => { setTypedConfirm(e.target.value); setConfirmError(''); }}
              autoFocus spellCheck={false} autoComplete="off"
              style={styles.confirmInput} />
            {confirmError && <p style={{ color: '#f53939', fontSize: 12, marginTop: 8 }}>{confirmError}</p>}
            <div style={styles.modalActions}>
              <button className="btn" onClick={handleConfirmSubmit} disabled={typedConfirm.length === 0}
                style={{
                  background: typedConfirm.length > 0 ? 'linear-gradient(310deg,#7928CA,#FF0080)' : 'rgba(255,255,255,0.08)',
                  color: '#fff', opacity: typedConfirm.length > 0 ? 1 : 0.5,
                  boxShadow: typedConfirm.length > 0 ? '0 3px 5px rgba(121,40,202,0.4)' : 'none',
                }}>Activate Mode 3</button>
              <button className="btn" onClick={() => { setShowMode3Modal(false); setConfirmError(''); }}
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
