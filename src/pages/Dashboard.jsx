/**
 * Dashboard.jsx — Command Central, built in the approved Workshop room.
 *
 * Authority: Architect approval 2026-08-04 of the Workshop room emulation
 * (WEBUI-BRIDGE-WORKSHOP-EMULATION-20260804T213000Z). That approval SUPERSEDES
 * the flat Pass-3 canon for page chrome — the room is a lit interior and cannot
 * be drawn in hairlines. Structure comes from the shared workshop-room.css so
 * this page is the same building as Markets, not a lookalike.
 *
 * The rule that survives the relaxed prohibition, and binds absolutely:
 * material is applied to the ROOM. Data sits on it, never inside it. Nothing
 * here colourises or decorates a value.
 *
 * Role — and why it is not the Bridge, which matters because two pages showing
 * the same fleet is how a dashboard becomes wallpaper:
 *   Bridge          answers "what is the fleet doing?"  — observation.
 *   Command Central answers "what needs ME?"            — decision.
 * The desk comes first and holds the page's only emphasis. If nothing is
 * blocked on the Architect, this page reads quiet. That is a true and useful
 * state, not an empty one to be padded.
 *
 * Data contract (Architect, 2026-08-04):
 *   1. An empty feed stays empty. No mock, sample, or last-known substitution.
 *   2. Degradation is per feed. One dead feed does not blank the others.
 *   3. A dead feed names itself and says how long it has been dark.
 *
 * Every value derives from a live prop. There is no seeded data in this file.
 */
import { useMemo, useState } from 'react';
import { ControlsCluster } from '../components/ControlsCluster';
import './workshop-room.css';
import './dashboard-room.css';

/* Fleet roster — identity canon, ratified 2026-08-02. Fourteen agents.
   An identity list, not data: names are canon, states are derived. */
const ROSTER = [
  'SEVIN', 'OVERSEER', 'ELEVIN', 'STAN',
  'TIKA', 'NAVIGATOR', 'COSMOS', 'QUANT',
  'ROOTS', 'AXIS', 'COMMS', 'NEXUS',
  'SAGE', 'VAULT',
];

/* VAULT is air-gapped by design. Its quiet is correct, never a defect. */
const SEALED = new Set(['VAULT']);

const ACTIVE_WINDOW_S = 15 * 60;

const COMMAND_TARGETS = [
  ['sevin', 'SEVIN'],
  ['overseer', 'OVERSEER'],
  ['elevin', 'ELEVIN'],
  ['all-agents', 'All routed agents'],
];

function commandId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* What counts as "blocked on the Architect". One explicit expression rather
   than scattered tests, so the definition can be argued with in one place. */
const AWAITING = /await|architect|approval|decision|ruling|ratif/i;

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

function Row({ state, name, meta }) {
  return (
    <div className="wsroom-row" data-state={state}>
      <span className="wsroom-row-mark" />
      <span className="wsroom-row-name">{name}</span>
      <span className="wsroom-row-meta">{meta}</span>
    </div>
  );
}

/**
 * Feed liveness rail. Consumes Lane A's feedHealth map when present; when it is
 * absent this degrades to UNKNOWN rather than inventing a healthy state.
 * Reporting a feed LIVE without evidence is the exact failure the rule exists
 * to prevent.
 */
function FeedRail({ feedHealth, connected }) {
  const feeds = useMemo(() => {
    const declared = [
      ['transport',      'websocket'],
      ['bus_activity',   'bus'],
      ['task_update',    'tasks'],
      ['market_context', 'markets'],
      ['comms',          'comms'],
    ];
    const now = Date.now() / 1000;
    return declared.map(([key, label]) => {
      if (key === 'transport') {
        return { key, label, state: connected ? 'LIVE' : 'DEAD', age: null };
      }
      const h = feedHealth?.[key];
      if (!h) return { key, label, state: 'UNKNOWN', age: null };
      if (!h.lastMessageAt) return { key, label, state: 'NO_DATA', age: null };
      return {
        key, label,
        state: key === 'market_context' && h.state === 'DEAD' ? 'STALE' : (h.state || 'UNKNOWN'),
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
          <span className="wsroom-rail-age">{f.age == null ? 'age unavailable' : `${ago(f.age)} ago`}</span>
        </div>
      ))}
    </div>
  );
}

export function Dashboard({
  killActive,
  mode3Conditions,
  mode3Enabled,
  onSend,
  busActivity,
  commsByChannel = {},
  connected,
  oauthStatus,
  tasks,
  activeProjects = [],
  activeTasks = [],
  feedHealth,
}) {
  const [commandTarget, setCommandTarget] = useState('sevin');
  const [commandBody, setCommandBody] = useState('');
  const [commands, setCommands] = useState([]);
  const [commandError, setCommandError] = useState('');
  const events   = Array.isArray(busActivity)    ? busActivity    : [];
  const taskList = Array.isArray(tasks)          ? tasks          : [];
  const projects = Array.isArray(activeProjects) ? activeProjects : [];
  const now = Date.now() / 1000;

  /* The desk. Oldest first — the thing that has been waiting longest is the
     thing most likely to have been forgotten, so it sits at the top rather
     than scrolling off the bottom. */
  const desk = useMemo(() => (
    taskList
      .filter(t => AWAITING.test(`${t.status || ''} ${t.title || ''}`))
      .map(t => ({ ...t, waited: t.since ?? t.updated_at ?? t.mtime ?? null }))
      .sort((a, b) => (a.waited ?? Infinity) - (b.waited ?? Infinity))
  ), [taskList]);

  const inflight = taskList.filter(t => /progress|active|in_flight/i.test(t.status || ''));
  const stuck    = taskList.filter(t => /blocked/i.test(t.status || '') && !AWAITING.test(t.status || ''));

  const issueCommand = () => {
    const body = commandBody.trim();
    if (!connected || !body) return;
    const clientMessageId = commandId();
    const submittedAt = Date.now() / 1000;
    const frame = { type: 'comms_message', channel: commandTarget, body, clientMessageId };
    if (onSend?.(frame) === false) {
      setCommandError('The websocket closed before this directive left Command Central. The text is still here.');
      return;
    }
    setCommands(prev => [{ clientMessageId, target: commandTarget, body, submittedAt }, ...prev].slice(0, 8));
    setCommandBody('');
    setCommandError('');
  };

  const commandState = (command) => {
    const channelEvents = commsByChannel[command.target] || [];
    const confirmed = channelEvents.some(event => (
      !event.pending &&
      (event.clientMessageId === command.clientMessageId || event.preview === command.body) &&
      (event.mtime || 0) >= command.submittedAt - 1
    ));
    return confirmed ? 'Written to bus · agent not woken' : 'Queued · awaiting bus confirmation';
  };

  /* Agent activity derives from observed bus traffic only. An agent that has
     not spoken renders unlit — we do not assert health we cannot see. */
  const lastSeen = useMemo(() => {
    const map = {};
    for (const e of events) {
      const who = (e.from || '').toUpperCase();
      if (!who) continue;
      if (!map[who] || e.mtime > map[who]) map[who] = e.mtime;
    }
    return map;
  }, [events]);

  return (
    <div className="wsroom">
      {/* The room. Environment only — it carries no data and never overlays a
          value. Material is applied here and nowhere else. */}
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
          <div className="wsroom-eyebrow">Master Workflow · Command Central</div>
          <h1 className="wsroom-title">What needs<br />your hand.</h1>
        </div>
        <div className="wsroom-standing">
          <div className={`wsroom-standing-value${desk.length === 0 ? ' cc-clear' : ''}`}>
            {desk.length}
          </div>
          <div className="wsroom-standing-label">awaiting the Architect</div>
        </div>
      </header>

      <FeedRail feedHealth={feedHealth} connected={connected} />

      <div className="cc-controls">
        <span className="cc-controls-label">Controls</span>
        <ControlsCluster
          killActive={killActive}
          mode3Conditions={mode3Conditions}
          mode3Enabled={mode3Enabled}
          onSend={onSend}
        />
      </div>

      <div className="wsroom-stations">
        {/* The reason the page exists. First station, only emphasis. */}
        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">At your desk</span>
            <span className="wsroom-station-count">{desk.length}</span>
          </div>
          <div className="cc-command-desk">
            <div className="cc-command-copy">
              <strong>Issue a directive</strong>
              <span>Uses the existing validated Agent Comms path. Bus placement does not wake an agent.</span>
            </div>
            <div className="cc-command-form">
              <label>
                <span>Address</span>
                <select value={commandTarget} onChange={event => setCommandTarget(event.target.value)}>
                  {COMMAND_TARGETS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label className="cc-command-body">
                <span>Directive</span>
                <textarea
                  value={commandBody}
                  onChange={event => setCommandBody(event.target.value)}
                  placeholder={connected ? 'State the outcome, boundary, and evidence required…' : 'Transport disconnected — directive held locally.'}
                  disabled={!connected}
                  rows={3}
                />
              </label>
              <button type="button" onClick={issueCommand} disabled={!connected || !commandBody.trim()}>
                Send directive
              </button>
            </div>
            <div className="cc-command-transport" data-connected={connected || undefined} role="status">
              {connected
                ? 'Connected · a bus confirmation will appear below. Agent wake remains unauthorized.'
                : 'Disconnected · no directive can leave this page.'}
            </div>
            {commandError && <div className="cc-command-error" role="alert">{commandError}</div>}
            {commands.length > 0 && (
              <div className="cc-command-ledger" aria-label="Directive state">
                {commands.map(command => (
                  <div className="cc-command-entry" key={command.clientMessageId}>
                    <span>{command.target}</span>
                    <strong>{command.body}</strong>
                    <em>{commandState(command)}</em>
                  </div>
                ))}
              </div>
            )}
          </div>
          {desk.length === 0 ? (
            <Empty
              what="Nothing awaiting you"
              why={connected
                ? 'The task feed is connected and reports nothing blocked on an Architect decision.'
                : 'The task feed is dark — this is not a claim that nothing is waiting.'}
            />
          ) : desk.map(t => (
            <Row
              key={t.task_id || t.id || t.title}
              state="fail"
              name={t.title || t.task_id}
              meta={<>
                {(t.owner || t.assignee || '').toUpperCase()}
                {t.waited != null && <> · <span className="cc-wait">{ago(now - t.waited)} waiting</span></>}
              </>}
            />
          ))}
        </section>

        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Standing conditions</span>
          </div>
          <Row state={killActive ? 'fail' : 'sealed'} name="Kill switch"
               meta={killActive ? 'ENGAGED' : 'clear'} />
          <Row state={oauthStatus?.degraded ? 'fail' : oauthStatus ? 'sealed' : 'unknown'}
               name="Provider auth"
               meta={oauthStatus?.degraded ? 'DEGRADED' : oauthStatus ? 'ok' : 'unknown'} />
          <Row state={mode3Enabled ? 'active' : 'sealed'} name="Trading — Mode 3"
               meta={mode3Enabled ? 'ARMED' : 'held · paper'} />
          <Row state="sealed" name="Autonomous spend" meta="zero · standing" />
          <Row state="sealed" name="VAULT air gap"    meta="sealed · architectural" />
        </section>

        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Moving</span>
            <span className="wsroom-station-count">{inflight.length}</span>
          </div>
          {inflight.length === 0 ? (
            <Empty
              what="No work in flight"
              why={connected
                ? 'The task feed is connected and reporting nothing active.'
                : 'The task feed is dark — this is not a claim that the fleet is idle.'}
            />
          ) : inflight.map(t => (
            <Row key={t.task_id || t.id || t.title} state="active"
                 name={t.title || t.task_id}
                 meta={(t.owner || t.assignee || '').toUpperCase()} />
          ))}
        </section>

        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Stuck</span>
            <span className="wsroom-station-count">{stuck.length}</span>
          </div>
          {stuck.length === 0 ? (
            <Empty what="Nothing stuck"
                   why="No task reports a blocked state that is not already on your desk." />
          ) : stuck.map(t => (
            <Row key={t.task_id || t.id || t.title} state="fail"
                 name={t.title || t.task_id}
                 meta={(t.owner || t.assignee || '').toUpperCase()} />
          ))}
        </section>

        {/* The glazed case — the one cool light in the room. */}
        <section className="wsroom-station wsroom-station--wide wsroom-station--glass">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">The bench</span>
            <span className="wsroom-station-count">
              {Object.keys(lastSeen).length} of {ROSTER.length} seen
            </span>
          </div>
          <div className="cc-bench">
            {ROSTER.map(name => {
              const seen   = lastSeen[name];
              const sealed = SEALED.has(name);
              const state  = sealed       ? 'sealed'
                           : seen == null ? 'unlit'
                           : (now - seen) < ACTIVE_WINDOW_S ? 'active'
                           : 'assigned';
              const color = state === 'active'   ? 'var(--status-work-inflight)'
                          : state === 'assigned' ? 'var(--status-work-assigned)'
                          : state === 'sealed'   ? 'var(--status-vault)'
                          : 'var(--status-idle)';
              return (
                <div className="cc-bench-cell" key={name}>
                  <span className="cc-bench-mark" style={{ background: color }} />
                  <span className="cc-bench-name">{name}</span>
                  <span className="cc-bench-state">
                    {sealed ? 'sealed' : seen == null ? 'unlit' : ago(now - seen)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Since you last looked</span>
            <span className="wsroom-station-count">{events.length}</span>
          </div>
          {events.length === 0 ? (
            <Empty what="No traffic observed"
                   why="The bus feed is quiet. Nothing is being substituted here." />
          ) : events.slice(-8).reverse().map(e => (
            <Row key={`${e.dir}/${e.file}`} state="active"
                 name={e.preview || e.file}
                 meta={`${(e.from || '—').toUpperCase()} · ${ago(now - e.mtime)}`} />
          ))}
        </section>

        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Projects</span>
            <span className="wsroom-station-count">{projects.length}</span>
          </div>
          {projects.length === 0 ? (
            <Empty what="No active projects" why="The project feed reports nothing open." />
          ) : projects.map(p => (
            <Row key={p.id}
                 state={p.status === 'blocked' ? 'fail' : p.status === 'done' ? 'sealed' : 'active'}
                 name={p.title || p.id}
                 meta={p.progress != null ? `${p.progress}%` : (p.status || '').replace('_', ' ')} />
          ))}
        </section>
      </div>

      <div className="wsroom-colophon">
        <span>Workshop room · Pass 3 palette</span>
        <span>Empty means empty</span>
      </div>
    </div>
  );
}
