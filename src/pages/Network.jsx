/**
 * Network.jsx — Bus Network, built in the approved Workshop room.
 *
 * Authority: Architect standing instruction 2026-08-05 — carry the Workshop
 * room across the whole site. Structure comes from the shared workshop-room.css
 * so this page is the same building as Command Central and Markets.
 *
 * Material is applied to the ROOM. Data sits on it, never inside it.
 *
 * NOT the AgentComms page. AgentComms is the channel client — categorised
 * channels, per-channel ring buffer, local echo, composing into a conversation.
 * This page is the BUS: raw routed traffic by agent pair, which message went
 * where and how long ago. One is a chat client; this is a routing ledger. They
 * are deliberately different views of different things, and neither should grow
 * into the other.
 *
 * WHAT CHANGED BEYOND THE SKIN — this page was almost entirely fabricated. The
 * previous version shipped MOCK_CHANNELS, MOCK_THREAD and MOCK_ROSTER: fifteen
 * invented channels, three invented messages with invented timestamps, and a
 * thirteen-agent roster with hardcoded statuses. It rendered a plausible,
 * confident, wholly fictional picture of fleet communications. That is the
 * exact failure the standing data rule exists to prevent, and it is worse here
 * than anywhere else on the site, because a comms page that invents messages
 * invents evidence.
 *
 * All of it is deleted. Every value now derives from a live prop:
 *   · Channels come from the identity roster (canon, not data) and their counts
 *     from observed bus traffic.
 *   · The thread is real bus messages, filtered to the selected channel.
 *   · Roster state is derived from when an agent was last actually heard.
 * An agent that has not spoken renders unlit. A quiet channel renders empty and
 * says so. Nothing is substituted.
 *
 * Data contract (Architect, 2026-08-04):
 *   1. An empty feed stays empty. No mock, sample, or last-known substitution.
 *   2. Degradation is per feed. One dead feed does not blank the others.
 *   3. A dead feed names itself and says how long it has been dark.
 */
import { useMemo, useState } from 'react';
import './workshop-room.css';
import './network-room.css';

/* Fleet roster — identity canon, ratified 2026-08-02. Fourteen agents.
   An identity list, not data: names are canon, states are derived. */
const ROSTER = [
  'SEVIN', 'OVERSEER', 'ELEVIN', 'STAN',
  'TIKA', 'NAVIGATOR', 'COSMOS', 'QUANT',
  'ROOTS', 'AXIS', 'COMMS', 'NEXUS',
  'SAGE', 'VAULT',
];

/* VAULT is air-gapped by design. It has no comms channel to read and its
   silence is correct — never a defect, and never a channel we pretend carries
   traffic. */
const SEALED = new Set(['VAULT']);

const ACTIVE_WINDOW_S = 15 * 60;
const PRIORITIES = ['P0', 'P1', 'P2'];

function ago(seconds) {
  if (seconds == null || !isFinite(seconds)) return '—';
  if (seconds < 60)    return `${Math.floor(seconds)}s`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function Empty({ what, why }) {
  return (
    <div className="wsroom-empty">
      <strong>{what}</strong>
      {why}
    </div>
  );
}

function FeedRail({ feedHealth, connected }) {
  const feeds = useMemo(() => {
    const declared = [
      ['transport',    'websocket'],
      ['bus_activity', 'bus'],
      ['comms',        'comms'],
    ];
    const now = Date.now() / 1000;
    return declared.map(([key, label]) => {
      if (key === 'transport') {
        return { key, label, state: connected ? 'LIVE' : 'DEAD', age: null };
      }
      const h = feedHealth?.[key];
      if (!h) return { key, label, state: 'UNKNOWN', age: null };
      return {
        key, label,
        state: h.state || 'UNKNOWN',
        age: h.lastMessageAt ? now - h.lastMessageAt : null,
      };
    });
  }, [feedHealth, connected]);

  return (
    <div className="wsroom-rail">
      {feeds.map(f => (
        <div className="wsroom-rail-item" data-state={f.state} key={f.key}>
          <span className="wsroom-rail-dot" />
          <span className="wsroom-rail-name">{f.label}</span>
          <span className="wsroom-rail-state">{f.state.replace('_', ' ')}</span>
          {f.age != null && <span className="wsroom-rail-age">{ago(f.age)} ago</span>}
        </div>
      ))}
    </div>
  );
}

export function Network({ busActivity, onSend, commsAnomaly, feedHealth, connected }) {
  const [selected, setSelected] = useState(null);
  const [priority, setPriority] = useState('P2');
  const [draft, setDraft] = useState('');

  const events = Array.isArray(busActivity) ? busActivity : [];
  const now = Date.now() / 1000;

  /* An event belongs to an agent's channel if that agent is either end of it.
     Direction names are `<from>-to-<to>`; sender is authoritative when present
     and the directory is the fallback, because a malformed `from` should not
     silently drop a message out of every channel. */
  const channelOf = useMemo(() => (e) => {
    const dir = (e.dir || '').toLowerCase();
    const from = (e.from || '').toUpperCase();
    return ROSTER.filter(name => {
      const n = name.toLowerCase();
      return from === name || dir.startsWith(`${n}-to-`) || dir.endsWith(`-to-${n}`);
    });
  }, []);

  const counts = useMemo(() => {
    const map = {};
    for (const e of events) for (const name of channelOf(e)) map[name] = (map[name] || 0) + 1;
    return map;
  }, [events, channelOf]);

  const lastSeen = useMemo(() => {
    const map = {};
    for (const e of events) {
      const who = (e.from || '').toUpperCase();
      if (!who) continue;
      if (!map[who] || e.mtime > map[who]) map[who] = e.mtime;
    }
    return map;
  }, [events]);

  /* No channel selected means show everything, which is the honest default:
     the fleet's traffic is the fleet's traffic until you narrow it. */
  const thread = useMemo(() => {
    const list = selected ? events.filter(e => channelOf(e).includes(selected)) : events;
    return [...list].sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 20);
  }, [events, selected, channelOf]);

  const canSend = draft.trim().length > 0 && typeof onSend === 'function';

  const handleSend = () => {
    if (!canSend) return;
    onSend({ channel: selected || 'all-agents', priority, body: draft });
    setDraft('');
  };

  return (
    <div className="wsroom">
      {/* The room. Environment only — it carries no data. */}
      <div className="wsroom-env" aria-hidden="true">
        <div className="wsroom-wall" />
        <div className="wsroom-window">
          <img src="/ai-city/workshop-establishing.png" alt="" />
        </div>
        <div className="wsroom-keystone" />
        <div className="wsroom-floor" />
        <div className="wsroom-lamp" />
        <div className="wsroom-vignette" />
      </div>

      <header className="wsroom-masthead">
        <div>
          <div className="wsroom-eyebrow">Master Workflow · Bus Network</div>
          <h1 className="wsroom-title">Every message,<br />and its route.</h1>
        </div>
        <div className="wsroom-standing">
          <div className="wsroom-standing-value">{events.length}</div>
          <div className="wsroom-standing-label">messages observed</div>
        </div>
      </header>

      <FeedRail feedHealth={feedHealth} connected={connected} />

      <div className="nw-floor">
        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Channels</span>
            <span className="wsroom-station-count">{ROSTER.length}</span>
          </div>
          <div className="nw-channels">
            <button
              className="nw-channel"
              aria-selected={selected === null}
              onClick={() => setSelected(null)}
            >
              <span className="nw-channel-name">all traffic</span>
              <span className="nw-channel-count">{events.length}</span>
            </button>
            {ROSTER.map(name => {
              const sealed = SEALED.has(name);
              return (
                <button
                  className="nw-channel"
                  key={name}
                  data-sealed={sealed || undefined}
                  aria-selected={selected === name}
                  onClick={() => setSelected(name)}
                >
                  <span className="nw-channel-name">{name.toLowerCase()}</span>
                  <span className="nw-channel-count">
                    {sealed ? 'sealed' : (counts[name] || 0)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">
              {selected ? selected.toLowerCase() : 'all traffic'}
            </span>
            <span className="wsroom-station-count">{thread.length}</span>
          </div>
          {thread.length === 0 ? (
            <Empty
              what={selected ? 'No traffic on this channel' : 'No traffic observed'}
              why={connected
                ? 'The bus feed is connected and reports nothing here. Nothing is being substituted.'
                : 'The bus feed is dark — this is not a claim that the channel is quiet.'}
            />
          ) : thread.map(e => (
            <article className="nw-msg" key={`${e.dir}/${e.file}`}>
              <div className="nw-msg-meta">
                <span className="nw-msg-from">{(e.from || 'unattributed').toUpperCase()}</span>
                <span>{e.dir}</span>
                <span className="nw-msg-age">{ago(now - e.mtime)} ago</span>
              </div>
              <div className="nw-msg-body">{e.preview || e.file}</div>
            </article>
          ))}
        </section>

        <div className="nw-compose-station" style={{ display: 'grid', gap: 26, alignContent: 'start' }}>
          <section className="wsroom-station">
            <div className="wsroom-station-head">
              <span className="wsroom-station-title">Compose</span>
              <span className="wsroom-station-count">{selected ? selected.toLowerCase() : 'all agents'}</span>
            </div>
            <textarea
              className="nw-compose"
              placeholder={connected ? 'Message…' : 'Transport is down — sending is unavailable.'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              aria-label="Message body"
            />
            <div className="nw-compose-row">
              <select
                className="nw-select"
                value={priority}
                onChange={e => setPriority(e.target.value)}
                aria-label="Priority"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="nw-send" onClick={handleSend} disabled={!canSend}>Send</button>
            </div>
          </section>

          <section className="wsroom-station">
            <div className="wsroom-station-head">
              <span className="wsroom-station-title">Comms safety</span>
            </div>
            {commsAnomaly ? (
              <article className="nw-msg">
                <div className="nw-msg-meta">
                  <span className="nw-msg-from">Anomaly</span>
                  <span className="nw-msg-age">{commsAnomaly.ts || 'time unavailable'}</span>
                </div>
                <div className="nw-msg-body">
                  {commsAnomaly.reason || 'Unspecified communications anomaly'}
                </div>
              </article>
            ) : (
              <Empty
                what="No anomalies received"
                why="The comms-safety feed reports nothing. Silence here is not a health claim."
              />
            )}
          </section>
        </div>

        {/* The glazed case — who has actually been heard from. */}
        <section className="wsroom-station wsroom-station--glass nw-span">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Heard from</span>
            <span className="wsroom-station-count">
              {Object.keys(lastSeen).length} of {ROSTER.length}
            </span>
          </div>
          <div className="nw-roster">
            {ROSTER.map(name => {
              const seen   = lastSeen[name];
              const sealed = SEALED.has(name);
              const color = sealed          ? 'var(--status-vault)'
                          : seen == null    ? 'var(--status-idle)'
                          : (now - seen) < ACTIVE_WINDOW_S ? 'var(--status-work-inflight)'
                          : 'var(--status-work-assigned)';
              return (
                <div className="nw-roster-cell" key={name}>
                  <span className="nw-roster-mark" style={{ background: color }} />
                  <span className="nw-roster-name">{name}</span>
                  <span className="nw-roster-state">
                    {sealed ? 'sealed' : seen == null ? 'unlit' : ago(now - seen)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="wsroom-colophon">
        <span>Workshop room · Pass 3 palette</span>
        <span>Empty means empty</span>
      </div>
    </div>
  );
}
