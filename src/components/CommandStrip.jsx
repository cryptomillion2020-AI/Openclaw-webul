/**
 * CommandStrip.jsx — Phase 4 Global Shell
 * Persistent command strip: Kill Switch, Mode indicator, LIVE/PAPER badge.
 * Always one click away per ops-console discipline.
 * Installed in App.jsx above the PageTransition.
 *
 * Reference: 05-PHASE-4-WEBUI-REDESIGN-SPEC.md §4.2 Dashboard item 1
 * Filed: 2026-07-05 by ELEVIN (Build Track C, Phase 4)
 */

/**
 * Props:
 *   - killActive:       boolean (is Kill Switch active?)
 *   - onKillToggle:     () => void (toggle Kill Switch)
 *   - mode3Enabled:     boolean (is autonomous mode active?)
 *   - onModeToggle:     () => void (toggle Mode 3)
 *   - tradingMode:      'live' | 'paper'  (trading mode)
 *   - connected:        boolean (WS connected?)
 *   - lastUpdate:       Date or null
 */

export function CommandStrip({
  killActive = false,
  onKillToggle = () => {},
  mode3Enabled = false,
  onModeToggle = () => {},
  tradingMode = 'paper',
  connected = false,
  lastUpdate = null,
}) {
  const isLive = tradingMode === 'live';

  return (
    <div className="command-strip">
      {/* ── Kill Switch ── */}
      <button
        className={`kill-switch${killActive ? ' armed' : ''}`}
        onClick={onKillToggle}
        title={killActive ? 'Kill Switch is ACTIVE — click to disarm' : 'Click to arm Kill Switch'}
        aria-label={killActive ? 'Disarm Kill Switch' : 'Arm Kill Switch'}
      >
        <span className="kill-icon">⏻</span>
        <span className="kill-label">{killActive ? 'KILLED' : 'KILL SW'}</span>
      </button>

      {/* ── Mode indicator ── */}
      <button
        className={`mode-indicator${mode3Enabled ? ' active' : ''}`}
        onClick={onModeToggle}
        title={mode3Enabled ? 'Autonomous mode ACTIVE' : 'Click to enable autonomous mode'}
        aria-label={mode3Enabled ? 'Disable autonomous mode' : 'Enable autonomous mode'}
      >
        <span className="mode-label">MODE</span>
        <span className="mode-value">{mode3Enabled ? 'AUTO' : 'MANUAL'}</span>
      </button>

      {/* ── Trading mode badge ── */}
      <div className={`trading-badge${isLive ? ' live' : ' paper'}`}
           title={isLive ? 'LIVE trading — capital at risk' : 'Paper trading — simulated mode'}
           role="status"
           aria-label={isLive ? 'LIVE trading mode active' : 'Paper trading mode active'}
      >
        <span className="badge-dot" aria-hidden="true">●</span>
        <span className="badge-label">{isLive ? 'LIVE' : 'PAPER'}</span>
      </div>

      {/* ── Connection state ── */}
      <div className="connection-state">
        <span
          className="conn-dot"
          style={{ color: connected ? 'var(--status-active)' : 'var(--status-offline)' }}
          aria-hidden="true"
        >
          ●
        </span>
        <span className="conn-text">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        {lastUpdate && (
          <span className="conn-timestamp" title={lastUpdate.toISOString()}>
            {new Date(Date.now() - lastUpdate.getTime()).toISOString().substring(11, 19)} ago
          </span>
        )}
      </div>
    </div>
  );
}

export default CommandStrip;
