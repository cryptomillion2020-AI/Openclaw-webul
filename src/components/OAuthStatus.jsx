/**
 * OAuthStatus.jsx — OAuth / Auth Status Dashboard
 * Uses pages.css table styles
 */

const USE_TELEMETRY_SOURCE = false;

const MODE_COLORS = {
  claude_cli: '#01B574', deepseek_api: '#01B574', ollama_local: '#0075FF',
  local_only: '#0075FF', api_key: '#FFB547', oauth: '#01B574',
  FAILED: '#f53939', unknown: '#718096',
};

const MODE_LABELS = {
  claude_cli: 'Claude CLI', deepseek_api: 'DeepSeek API',
  ollama_local: 'Local Ollama', local_only: 'Local Only (VAULT)',
  api_key: 'API Key', oauth: 'OAuth',
};

export function OAuthStatus({ oauthStatus }) {
  const entries = Object.entries(oauthStatus || {});

  return (
    <div>
      {entries.length === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '8px 0' }}>Loading auth profiles…</p>
      ) : (
        <table className="positions-table" style={{ marginTop: 8 }}>
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
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{agent.toUpperCase()}</td>
                <td>
                  <span style={{
                    display: 'inline-block',
                    width: 7, height: 7,
                    borderRadius: '50%',
                    background: MODE_COLORS[data.auth_mode] || '#718096',
                    boxShadow: `0 0 6px ${MODE_COLORS[data.auth_mode] || '#718096'}`,
                    marginRight: 6,
                    verticalAlign: 'middle',
                  }} />
                  {MODE_LABELS[data.auth_mode] || data.auth_mode}
                </td>
                <td>
                  {data.vault_carve_out ? (
                    <span className="status-pill pill-complete">VAULT</span>
                  ) : data.fallback_mode !== 'none' ? (
                    <span className="status-pill pill-pending">fallback: {data.fallback_mode}</span>
                  ) : (
                    <span className="status-pill pill-complete">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
