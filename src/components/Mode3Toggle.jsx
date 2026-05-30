/**
 * Mode3Toggle.jsx — Mode 3 (Paper Trading) Toggle
 * Vision UI glass card styling
 */

import { useState } from 'react';

const CONDITION_LABELS = {
  kill_switch_inactive:   { label: 'Kill Switch Inactive',      icon: '🔒' },
  paper_mode_confirmed:   { label: 'Paper Mode Confirmed',      icon: '✍️' },
  stan_audit_passed:      { label: 'STAN Audit Passed',         icon: '✅' },
  quant_proposal_approved:{ label: 'QUANT Proposal Approved',   icon: '📋' },
  architect_authorized:   { label: 'Architect Authorized',      icon: '🏛️' },
};

export function Mode3Toggle({ mode3Conditions = {}, mode3Enabled = false, onSend }) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const conditionKeys = Object.keys(CONDITION_LABELS);
  const allMet = conditionKeys.every(key => mode3Conditions[key] === true);
  const isActive = mode3Conditions.paper_mode_confirmed === true && allMet;

  const handleToggleClick = () => {
    if (isActive) {
      onSend({ type: 'mode3_condition_update', key: 'paper_mode_confirmed', value: false });
      return;
    }
    if (!allMet) return;
    setTypedConfirm('');
    setConfirmError('');
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = () => {
    if (typedConfirm === 'CONFIRM') {
      onSend({ type: 'mode3_confirm', confirm_string: 'CONFIRM' });
      setShowConfirmModal(false);
      setTypedConfirm('');
      setConfirmError('');
    } else {
      setConfirmError(`Must type exactly: CONFIRM (case-sensitive). Got: "${typedConfirm}"`);
    }
  };

  const handleModalClose = () => {
    setShowConfirmModal(false);
    setTypedConfirm('');
    setConfirmError('');
  };

  // Inline styles for the toggle slider
  const toggleStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '8px 16px',
    borderRadius: '10px',
    background: isActive
      ? 'linear-gradient(310deg, #7928CA, #FF0080)'
      : allMet
        ? 'rgba(1, 181, 116, 0.15)'
        : 'rgba(255,255,255,0.05)',
    border: `1px solid ${
      isActive ? 'rgba(121,40,202,0.4)' : allMet ? 'rgba(1,181,116,0.3)' : 'rgba(255,255,255,0.1)'
    }`,
    color: isActive ? 'white' : 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: '13px',
    transition: 'all 0.2s ease',
    userSelect: 'none',
  };

  const modalActionsStyle = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '16px',
  };

  return (
    <div className="glass-card" style={{ border: isActive ? '1px solid rgba(121,40,202,0.4)' : undefined }}>
      <h3 className="card-title">📊 Mode 3 Toggle</h3>
      <p className="card-subtitle">
        Mode 3 (Paper) — {isActive ? '🟢 ACTIVE' : allMet ? '⚡ Ready to activate' : '🔒 Conditions pending'}
      </p>

      {/* Conditions checklist */}
      <div className="mode3-checklist" style={{ margin: '12px 0' }}>
        {Object.entries(CONDITION_LABELS).map(([key, info]) => {
          const met = mode3Conditions[key] === true;
          return (
            <div key={key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 0',
              fontSize: '12px',
              color: met ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              <span>{met ? '✅' : '⏳'}</span>
              <span>{info.label}</span>
            </div>
          );
        })}
      </div>

      {/* Toggle */}
      <div style={toggleStyle} onClick={handleToggleClick} role="button" tabIndex={0}>
        <span>{isActive ? '🟢' : allMet ? '⚡' : '🔒'}</span>
        <span>{isActive ? 'Mode 3 (Paper) — Active' : 'Mode 3 (Paper)'}</span>
      </div>

      {!allMet && !isActive && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          🔒 Complete all conditions above to enable
        </p>
      )}
      {allMet && !isActive && (
        <p style={{ fontSize: '11px', color: '#01B574', marginTop: '8px' }}>
          ⚡ All conditions met — click toggle to activate
        </p>
      )}
      {isActive && (
        <p style={{ fontSize: '11px', color: '#17c1e8', marginTop: '8px' }}>
          🟢 Mode 3 paper trading active — click toggle to deactivate
        </p>
      )}

      {/* CONFIRM typed-confirm modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={handleModalClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginBottom: '8px' }}>✍️ Confirm Mode 3 Activation</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
              Type <strong>CONFIRM</strong> (case-sensitive) to activate Mode 3 paper trading.
            </p>
            <input
              type="text"
              placeholder="Type CONFIRM..."
              value={typedConfirm}
              onChange={(e) => { setTypedConfirm(e.target.value); setConfirmError(''); }}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontFamily: 'var(--font-family)',
                outline: 'none',
              }}
            />
            {confirmError && (
              <p style={{ color: '#f53939', fontSize: '12px', marginTop: '8px' }}>{confirmError}</p>
            )}
            <div style={modalActionsStyle}>
              <button
                className="btn"
                onClick={handleConfirmSubmit}
                disabled={typedConfirm.length === 0}
                style={{
                  background: typedConfirm.length > 0 ? 'linear-gradient(310deg, #7928CA, #FF0080)' : 'rgba(255,255,255,0.08)',
                  color: 'white',
                  boxShadow: typedConfirm.length > 0 ? '0 3px 5px rgba(121,40,202,0.4)' : 'none',
                  opacity: typedConfirm.length > 0 ? 1 : 0.5,
                }}
              >
                Activate Mode 3
              </button>
              <button className="btn" onClick={handleModalClose}
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
