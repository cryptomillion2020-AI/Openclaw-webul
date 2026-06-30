/**
 * Vault.jsx — Pass 3 P3.1 Tier 5 — Private Vault rebrand
 * ConstellationScene background + bento layout:
 * Lock state hero, air-gap indicator, redacted items list, 60-day audit log.
 */
import { ConstellationScene } from '../three/ConstellationScene';

const MOCK_LOCK = { state: 'LOCKED', lastUnlock: '2026-06-15T19:42:00Z', failedAttempts24h: 0 };

const MOCK_ITEMS = [
  { id: 'v-001', label: '████████████████ ███ ████', size: '2.4 KB',  classification: 'L4' },
  { id: 'v-002', label: '██████ ████████ ██████',     size: '14.8 KB', classification: 'L4' },
  { id: 'v-003', label: '████████████ ███████',       size: '8.1 KB',  classification: 'L3' },
  { id: 'v-004', label: '██████████████████████',     size: '720 B',   classification: 'L4' },
  { id: 'v-005', label: '█████████ ████ █████',       size: '3.2 KB',  classification: 'L3' },
];

const MOCK_AUDIT = [
  { ts: '2026-06-30T14:18:00Z', actor: 'SYSTEM',    action: 'Layer-1 air-gap check', result: 'PASS' },
  { ts: '2026-06-30T13:18:00Z', actor: 'SYSTEM',    action: 'Layer-1 air-gap check', result: 'PASS' },
  { ts: '2026-06-29T22:42:00Z', actor: 'ARCHITECT', action: 'Vault state query',     result: 'PASS' },
  { ts: '2026-06-29T19:53:00Z', actor: 'ARCHITECT', action: 'R-3 closure ratify',    result: 'PASS' },
  { ts: '2026-06-15T19:42:00Z', actor: 'ARCHITECT', action: 'Unlock + read v-002',   result: 'PASS' },
  { ts: '2026-06-15T19:38:00Z', actor: 'ARCHITECT', action: 'Authenticate',          result: 'PASS' },
  { ts: '2026-06-10T08:00:00Z', actor: 'SYSTEM',    action: 'Layer-1 deploy verify', result: 'LIVE' },
];

function fmtTs(iso) {
  const d = new Date(iso);
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

export function Vault({ busActivity }) {
  return (
    <div className="vault-page">
      <ConstellationScene busActivity={busActivity} />

      <div className="vault-grid">
        <div className="bento-card vault-lock">
          <div className="bento-card-label">Vault State</div>
          <div className="bento-card-hero">{MOCK_LOCK.state}</div>
          <div className="bento-card-sub">
            Last unlock: {fmtTs(MOCK_LOCK.lastUnlock)} · {MOCK_LOCK.failedAttempts24h} failed attempts (24h)
          </div>
        </div>

        <div className="bento-card vault-airgap">
          <div className="bento-card-label">Air-Gap Layer 1</div>
          <div style={{ fontSize: 18, color: 'var(--status-airgap)', fontWeight: 600, marginTop: 8 }}>
            LIVE
          </div>
          <div className="airgap-indicator">bus_bridge.py hard-block active</div>
          <div className="bento-card-sub" style={{ marginTop: 6 }}>
            Discord→VAULT inbound blocked at process boundary. Layer 2 (netns) queued.
          </div>
        </div>

        <div className="bento-card vault-items">
          <div className="bento-card-label">Stored Items ({MOCK_ITEMS.length})</div>
          {MOCK_ITEMS.map(item => (
            <div key={item.id} className="vault-item-row">
              <span className="vault-item-redacted">{item.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{item.size}</span>
              <span className="priority-pill P0" style={{ background: 'rgba(124,58,237,0.2)', color: 'var(--cat-violet)' }}>
                {item.classification}
              </span>
            </div>
          ))}
          <div className="bento-card-sub" style={{ marginTop: 8 }}>
            Contents redacted at render. Unlock with credentials to reveal.
          </div>
        </div>

        <div className="bento-card vault-audit">
          <div className="bento-card-label">Audit Log (60 days)</div>
          <table className="audit-table">
            <thead>
              <tr><th>Time</th><th>Actor</th><th>Action</th><th>Result</th></tr>
            </thead>
            <tbody>
              {MOCK_AUDIT.map((a, i) => (
                <tr key={i}>
                  <td>{fmtTs(a.ts)}</td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td style={{ color: a.result === 'PASS' || a.result === 'LIVE' ? 'var(--status-active)' : 'var(--status-blocked)' }}>
                    {a.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
