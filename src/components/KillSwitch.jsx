/**
 * KillSwitch.jsx — Kill-Switch Control Surface
 * Vision UI glass card styling
 */

import { useState } from 'react';

const KILL_SWITCH_ACTION = 'kill_switch_activate';
const KILL_SWITCH_DEACTIVATE = 'kill_switch_deactivate';

export function KillSwitch({ active, onSend }) {
  const [showModal, setShowModal] = useState(false);
  const [deactivateModal, setDeactivateModal] = useState(false);

  const handleActivateClick = () => setShowModal(true);
  const handleDeactivateClick = () => setDeactivateModal(true);

  const confirmActivate = () => {
    onSend({ type: KILL_SWITCH_ACTION });
    setShowModal(false);
  };

  const confirmDeactivate = () => {
    onSend({ type: KILL_SWITCH_DEACTIVATE });
    setDeactivateModal(false);
  };

  return (
    <div className="glass-card">
      <h3 className="card-title">⛔ Kill Switch</h3>
      <p className="card-subtitle">Halt all QUANT activity</p>

      <div style={{ fontSize: '16px', fontWeight: 700, margin: '12px 0', textAlign: 'center' }}>
        {active ? '🔴 KILL ACTIVE' : '🟢 INACTIVE'}
      </div>

      {!active ? (
        <button className="btn btn-kill" onClick={handleActivateClick} style={{ width: '100%', justifyContent: 'center' }}>
          Activate Kill Switch
        </button>
      ) : (
        <button className="btn" onClick={handleDeactivateClick}
          style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(310deg, #01B574, #00d09c)', color: 'white', boxShadow: '0 3px 8px rgba(1,181,116,0.4)' }}>
          Deactivate Kill Switch
        </button>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h4 style={{ marginBottom: '8px' }}>⚠ Confirm Kill Switch</h4>
            <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>This will halt ALL QUANT activity immediately. Are you sure?</p>
            <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-kill" onClick={confirmActivate}>Yes, halt QUANT</button>
              <button className="btn" onClick={() => setShowModal(false)}
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deactivateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h4 style={{ marginBottom: '8px' }}>Deactivate Kill Switch?</h4>
            <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>QUANT activity will resume.</p>
            <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={confirmDeactivate}
                style={{ background: 'linear-gradient(310deg, #01B574, #00d09c)', color: 'white', boxShadow: '0 3px 8px rgba(1,181,116,0.4)' }}>Deactivate</button>
              <button className="btn" onClick={() => setDeactivateModal(false)}
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
