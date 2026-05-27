/**
 * KillSwitch.jsx — Kill-Switch Control Surface
 * Phase 5 Item 2 — Surface 1
 *
 * Writes to shared/state/quant-kill-active via websocket.
 * Polls state every 5s (driven by parent via ws updates).
 * Red when active, Green when inactive.
 * Visual confirmation modal required before activation.
 *
 * Phase 6 Item 1 dependency note:
 *   quant_kill_active() primitive ships in Phase 6 Item 1.
 *   This button uses a direct file-write placeholder via websocket backend.
 *   When Phase 6 Item 1 lands, the wiring is a one-line swap.
 *   Write path configured via KILL_SWITCH_ACTION constant (already parameterised).
 */

import { useState } from 'react';

// Configurable write path (swap for Phase 6 Item 1 primitive when ready)
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
    <div className="surface-card kill-switch-surface">
      <h3>⛔ Kill Switch</h3>
      <p className="surface-subtitle">Halt all QUANT activity</p>

      <div className={`kill-indicator ${active ? 'kill-active' : 'kill-inactive'}`}>
        {active ? '🔴 KILL ACTIVE' : '🟢 INACTIVE'}
      </div>

      {!active ? (
        <button className="kill-btn danger" onClick={handleActivateClick}>
          Activate Kill Switch
        </button>
      ) : (
        <button className="kill-btn safe" onClick={handleDeactivateClick}>
          Deactivate Kill Switch
        </button>
      )}

      {/* Activation confirmation modal (GF-4) */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h4>⚠ Confirm Kill Switch</h4>
            <p>This will halt ALL QUANT activity immediately.</p>
            <p>Are you sure?</p>
            <div className="modal-actions">
              <button className="btn-confirm-danger" onClick={confirmActivate}>
                Yes, halt QUANT
              </button>
              <button className="btn-cancel" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h4>Deactivate Kill Switch?</h4>
            <p>QUANT activity will resume.</p>
            <div className="modal-actions">
              <button className="btn-confirm-safe" onClick={confirmDeactivate}>
                Deactivate
              </button>
              <button className="btn-cancel" onClick={() => setDeactivateModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
