/**
 * PrivateVault.jsx — Page 5: Private Agent VAULT
 * Uses pages.css class names — dark red aesthetic
 */

export function PrivateVault() {
  return (
    <div className="vault-page-wrapper">
      <div className="vault-page-inner">
        {/* Top bar */}
        <div className="vault-top-bar">
          <div className="vault-title-area">
            <h2 className="vault-title-text">🔒 Private VAULT</h2>
          </div>
          <div className="vault-indicators-row">
            <div className="vault-indicator">
              <span className="vault-indicator-dot" style={{ background: '#01B574', boxShadow: '0 0 6px #01B574' }} />
              Session Encrypted
            </div>
            <div className="vault-indicator">
              <span className="vault-indicator-dot" style={{ background: '#01B574', boxShadow: '0 0 6px #01B574' }} />
              No Bus Routing
            </div>
            <div className="vault-indicator">
              <span className="vault-indicator-dot" style={{ background: '#01B574', boxShadow: '0 0 6px #01B574' }} />
              Secure
            </div>
            <div className="vault-lock-badge">🔐 VAULT LOCKED</div>
          </div>
        </div>

        <div className="vault-private-banner">
          🔒 This session is not routed through the bus. All data stays local.
        </div>

        {/* Main area: chat + audit */}
        <div className="vault-main-area">
          {/* Chat */}
          <div className="vault-chat">
            <div className="vault-messages">
              <div className="vault-message" style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔐</div>
                <p style={{ fontSize: 13 }}>VAULT chat is offline by design. Use secure channels for communication.</p>
              </div>
            </div>
            <div className="vault-input-area">
              <div className="vault-input-row">
                <input type="text" placeholder="VAULT chat is disabled (secure channel)" disabled />
                <button className="vault-send-btn" disabled>Send</button>
              </div>
            </div>
          </div>

          {/* Audit panel */}
          <div className="vault-audit-panel">
            <div className="audit-panel-header">
              <span>Security Audit Log</span>
            </div>
            <div className="audit-items-list">
              <div className="audit-item">
                <span className="audit-label" style={{ color: '#01B574' }}>✅ SECURE</span>
                <span className="audit-text">Session initialized</span>
                <span className="audit-time">now</span>
              </div>
              <div className="audit-item">
                <span className="audit-label" style={{ color: '#01B574' }}>✅ SECURE</span>
                <span className="audit-text">Encryption verified</span>
                <span className="audit-time">now</span>
              </div>
              <div className="audit-item">
                <span className="audit-label" style={{ color: '#01B574' }}>✅ SECURE</span>
                <span className="audit-text">No bus routing — isolated session</span>
                <span className="audit-time">now</span>
              </div>
            </div>

            {/* Threat meters */}
            <div className="threat-section">
              <div className="threat-title">Threat Levels</div>
              <div className="threat-meter">
                <span className="threat-meter-label">Data Exposure</span>
                <div className="threat-bar-track">
                  <div className="threat-bar-fill" style={{ width: '8%', background: '#01B574' }} />
                </div>
              </div>
              <div className="threat-meter">
                <span className="threat-meter-label">Network Risk</span>
                <div className="threat-bar-track">
                  <div className="threat-bar-fill" style={{ width: '15%', background: '#01B574' }} />
                </div>
              </div>
              <div className="threat-meter">
                <span className="threat-meter-label">Auth Integrity</span>
                <div className="threat-bar-track">
                  <div className="threat-bar-fill" style={{ width: '5%', background: '#01B574' }} />
                </div>
              </div>
              <div className="threat-meter">
                <span className="threat-meter-label">Session Health</span>
                <div className="threat-bar-track">
                  <div className="threat-bar-fill" style={{ width: '95%', background: '#01B574' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
