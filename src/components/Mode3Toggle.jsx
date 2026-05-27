/**
 * Mode3Toggle.jsx — Mode 3 (Paper Trading) Toggle
 * Phase 5 Item 2 — Surface 2
 *
 * Currently INERT. Renders visually but is wired to nothing until Phase 6 Item 6.
 * Label clearly indicates: "Mode 3 (Paper) — Requires Phase 6 authorization"
 * console.warn() logged on any click attempt.
 */

export function Mode3Toggle() {
  const handleToggle = () => {
    console.warn(
      '[OpenClaw UI] Mode 3 authorization gate — Phase 6 Item 6 required. ' +
      'Toggle is currently inert.'
    );
  };

  return (
    <div className="surface-card mode3-surface">
      <h3>📊 Mode 3 Toggle</h3>
      <p className="surface-subtitle surface-inert-label">
        Mode 3 (Paper) — Requires Phase 6 authorization
      </p>

      <div className="mode3-toggle-container">
        <label className="toggle-label inert-toggle" onClick={handleToggle}>
          <input
            type="checkbox"
            disabled
            aria-label="Mode 3 toggle — currently inert"
            title="Mode 3 activation requires Phase 6 Item 6 authorization"
          />
          <span className="toggle-slider" />
          <span className="toggle-text">Mode 3 (Paper)</span>
        </label>
        <p className="inert-note">
          🔒 Locked — Phase 6 Item 6 required for activation
        </p>
      </div>
    </div>
  );
}
