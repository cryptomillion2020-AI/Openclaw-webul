/**
 * Network.jsx — Pass 3 P3.1 Tier 5 — Agent Comms rebrand
 * ConstellationScene background + 3-column bento layout:
 * channels list, selected thread, composer + roster.
 */
import { useState } from 'react';
import { ConstellationScene } from '../three/ConstellationScene';

const MOCK_CHANNELS = [
  { id: 'architect',       name: '#architect',        unread: 0 },
  { id: 'sevin',           name: '#sevin',            unread: 2 },
  { id: 'overseer',        name: '#overseer',         unread: 1 },
  { id: 'elevin',          name: '#elevin',           unread: 0 },
  { id: 'tika',            name: '#tika',             unread: 0 },
  { id: 'quant',           name: '#quant',            unread: 0 },
  { id: 'nexus',           name: '#nexus',            unread: 0 },
  { id: 'comms',           name: '#comms',            unread: 0 },
  { id: 'axis',            name: '#axis',             unread: 0 },
  { id: 'cosmos',          name: '#cosmos',           unread: 0 },
  { id: 'navigator',       name: '#navigator',        unread: 0 },
  { id: 'stan',            name: '#stan',             unread: 0 },
  { id: 'vault',           name: '#vault',            unread: 0 },
  { id: 'all-agents',      name: '#all-agents',       unread: 0 },
  { id: 'quant-signals',   name: '#quant-signals',    unread: 0 },
];

const MOCK_THREAD = {
  sevin: [
    { from: 'OVERSEER', ts: '14:18:42', priority: 'P1', body: 'Tier 2b a11y commit a397794 verified. Bento delta + timeframe tokens render on Bridge.' },
    { from: 'SEVIN',    ts: '14:19:01', priority: 'P2', body: 'Confirmed. Moving to Tier 5 — 4 pages over iter-5 ConstellationScene.' },
    { from: 'OVERSEER', ts: '14:20:15', priority: 'P2', body: 'PM/SM cadence operational. Status board updated.' },
  ],
};

const MOCK_ROSTER = [
  { id: 'sevin',     status: 'active'  },
  { id: 'overseer',  status: 'active'  },
  { id: 'elevin',    status: 'idle'    },
  { id: 'tika',      status: 'idle'    },
  { id: 'quant',     status: 'hold'    },
  { id: 'nexus',     status: 'idle'    },
  { id: 'comms',     status: 'idle'    },
  { id: 'axis',      status: 'idle'    },
  { id: 'cosmos',    status: 'idle'    },
  { id: 'navigator', status: 'idle'    },
  { id: 'stan-local',status: 'idle'    },
  { id: 'stan-hl',   status: 'offline' },
  { id: 'vault',     status: 'airgap'  },
];

const STATUS_COLOR = {
  active:  'var(--status-active)',
  idle:    'var(--status-pending)',
  hold:    'var(--status-hold)',
  offline: 'var(--status-dead)',
  airgap:  'var(--status-airgap)',
};

export function Network({ busActivity, onSend, commsAnomaly, feedHealth }) {
  const [selectedChannel, setSelectedChannel] = useState('sevin');
  const [priority, setPriority] = useState('P2');
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    if (!draft.trim()) return;
    if (onSend) onSend({ channel: selectedChannel, priority, body: draft });
    setDraft('');
  };

  const messages = MOCK_THREAD[selectedChannel] || [];

  return (
    <div className="network-page">
      <ConstellationScene busActivity={busActivity} />

      <div className="network-grid">
        <div className="bento-card">
          <div className="bento-card-label">Comms Safety · MONITORING</div>
          {commsAnomaly ? (
            <div className="thread-msg">
              <div className="thread-msg-meta"><span className="thread-msg-from">ANOMALY</span><span>{commsAnomaly.ts || 'time unavailable'}</span></div>
              <div className="thread-msg-body">{commsAnomaly.reason || 'Unspecified communications anomaly'}</div>
            </div>
          ) : <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>No communications anomalies received.</div>}
        </div>
        <div className="bento-card network-channels">
          <div className="bento-card-label">Channels</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {MOCK_CHANNELS.map(c => (
              <div
                key={c.id}
                className={`channel-row ${selectedChannel === c.id ? 'active' : ''}`}
                onClick={() => setSelectedChannel(c.id)}
              >
                <span className="channel-row-name">{c.name}</span>
                {c.unread > 0 && <span className="channel-row-unread">{c.unread}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="bento-card network-thread">
          <div className="bento-card-label">{MOCK_CHANNELS.find(c => c.id === selectedChannel)?.name || 'Thread'}</div>
          {messages.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No messages yet on this channel.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="thread-msg">
              <div className="thread-msg-meta">
                <span className="thread-msg-from">{m.from}</span>
                <span>{m.ts}</span>
                <span className={`priority-pill ${m.priority}`}>{m.priority}</span>
              </div>
              <div className="thread-msg-body">{m.body}</div>
            </div>
          ))}
        </div>

        <div className="bento-card network-composer">
          <div className="bento-card-label">Compose</div>
          <textarea
            className="composer-textarea"
            placeholder="Message…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            aria-label="Message body"
          />
          <div className="composer-row">
            <select
              className="composer-priority"
              value={priority}
              onChange={e => setPriority(e.target.value)}
              aria-label="Priority"
            >
              <option value="P0">P0 — urgent</option>
              <option value="P1">P1 — high</option>
              <option value="P2">P2 — normal</option>
            </select>
            <button className="composer-send" onClick={handleSend}>Send</button>
          </div>
        </div>

        <div className="bento-card network-roster">
          <div className="bento-card-label">Roster (13)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {MOCK_ROSTER.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[r.status] }} />
                <span style={{ flex: 1 }}>{r.id.toUpperCase()}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
