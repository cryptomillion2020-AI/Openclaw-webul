/**
 * OAuthStatus.jsx — OAuth Status Indicator
 * Phase 5 Item 2 — Surface 3
 *
 * Placeholder until Phase 5 Item 3 telemetry wrapper lands.
 * Currently reads from auth-profiles.json via websocket backend.
 * Shows configured auth_mode per agent (not real-time actual_mode yet).
 *
 * When Item 3 ships: swap DATA_SOURCE to real telemetry endpoint.
 * The data source is configurable via the USE_TELEMETRY_SOURCE flag.
 */

// Configurable: swap to true when Phase 5 Item 3 telemetry is live
const USE_TELEMETRY_SOURCE = false;

const MODE_COLORS = {
  claude_cli:   'green',
  deepseek_api: 'green',
  ollama_local: 'blue',
  local_only:   'blue',
  api_key:      'amber',
  oauth:        'green',
  FAILED:       'red',
  unknown:      'grey',
};

const MODE_LABELS = {
  claude_cli:   'Claude CLI (subscription)',
  deepseek_api: 'DeepSeek API',
  ollama_local: 'Local Ollama',
  local_only:   'Local Only (VAULT)',
  api_key:      'API Key',
  oauth:        'OAuth',
};

function statusDot(mode) {
  const color = MODE_COLORS[mode] || 'grey';
  return <span className={`status-dot status-${color}`} title={mode}>●</span>;
}

export function OAuthStatus({ oauthStatus }) {
  const entries = Object.entries(oauthStatus || {});

  return (
    <div className="surface-card oauth-surface">
      <h3>🔐 OAuth / Auth Status</h3>
      <p className="surface-subtitle">
        {USE_TELEMETRY_SOURCE
          ? 'Live telemetry source (Item 3)'
          : 'Configured mode from auth-profiles.json (placeholder until Item 3)'}
      </p>

      {entries.length === 0 ? (
        <p className="loading-text">Loading auth profiles…</p>
      ) : (
        <table className="oauth-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Mode</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([agent, data]) => (
              <tr key={agent}>
                <td className="agent-name-cell">{agent.toUpperCase()}</td>
                <td className="mode-cell">
                  {statusDot(data.auth_mode)}
                  {' '}
                  {MODE_LABELS[data.auth_mode] || data.auth_mode}
                </td>
                <td className="status-cell">
                  {data.vault_carve_out
                    ? <span className="badge badge-vault">VAULT</span>
                    : data.fallback_mode !== 'none'
                      ? <span className="badge badge-fallback">fallback: {data.fallback_mode}</span>
                      : <span className="badge badge-ok">OK</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
