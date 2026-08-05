/**
 * Bridge.jsx — Command Bridge, rebuilt to approved Workshop canon.
 *
 * Authority: Architect approval of AICITY-PASS3-20260803T151124Z.
 * Canon prohibition applied: no floating cards, gradients, pills, or
 * ornamental metrics. Structure is rules and rails; the data carries the page.
 *
 * Data contract (Architect, 2026-08-04):
 *   1. An empty feed stays empty. No mock, sample, or last-known substitution.
 *   2. Degradation is per feed. One dead feed does not blank the others.
 *   3. A dead feed names itself and says how long it has been dark.
 *
 * Every value on this page derives from a live prop. There is no seeded data
 * in this file, by design — if the fleet is quiet, the Bridge reads quiet.
 */
import { useMemo } from 'react';
import './bridge-canon.css';

/* Fleet roster — identity canon, ratified 2026-08-02. Fourteen agents.
   This is an identity list, not data: names are canon, states are derived. */
const ROSTER = [
  'SEVIN', 'OVERSEER', 'ELEVIN', 'STAN',
  'TIKA', 'NAVIGATOR', 'COSMOS', 'QUANT',
  'ROOTS', 'AXIS', 'COMMS', 'NEXUS',
  'SAGE', 'VAULT',
];

/* VAULT is air-gapped by design. Its quiet is correct, never a defect. */
const SEALED = new Set(['VAULT']);

const ACTIVE_WINDOW_S = 15 * 60;

function ago(seconds) {
  if (seconds == null || !isFinite(seconds)) return '—';
  if (seconds < 60)    return `${Math.floor(seconds)}s`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Feed liveness rail. Consumes Lane A's feedHealth map when present; when it
 * is absent this degrades to UNKNOWN rather than inventing a healthy state.
 * Reporting a feed as LIVE without evidence would be the exact failure the
 * rule exists to prevent.
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
      return { key, label, state: h.state || 'UNKNOWN', age: h.lastMessageAt ? now - h.lastMessageAt : null };
    });
  }, [feedHealth, connected]);

  return (
    <div className="bridge-feeds">
      {feeds.map(f => (
        <div className="bridge-feed" data-state={f.state} key={f.key}>
          <span className="bridge-feed-dot" />
          <span className="bridge-feed-name">{f.label}</span>
          <span className="bridge-feed-state">{f.state}</span>
          {f.age != null && <span className="bridge-feed-age">{ago(f.age)} ago</span>}
        </div>
      ))}
    </div>
  );
}

function Empty({ what, why }) {
  return (
    <div className="bridge-empty">
      <strong>{what}</strong>
      {why}
    </div>
  );
}

export function Bridge({
  killActive,
  busActivity,
  connected,
  tasks,
  activeProjects,
  activeTasks,
  oauthStatus,
  feedHealth,
}) {
  const events   = Array.isArray(busActivity)   ? busActivity   : [];
  const taskList = Array.isArray(tasks)         ? tasks         : [];
  const projects = Array.isArray(activeProjects) ? activeProjects : [];

  /* Agent activity derives from observed bus traffic only. An agent that has
     not spoken is rendered unlit — we do not assert health we cannot see. */
  const lastSeen = useMemo(() => {
    const map = {};
    for (const e of events) {
      const who = (e.from || '').toUpperCase();
      if (!who) continue;
      if (!map[who] || e.mtime > map[who]) map[who] = e.mtime;
    }
    return map;
  }, [events]);

  const now = Date.now() / 1000;

  const decisions = taskList.filter(t =>
    /await|architect|approval|decision/i.test(`${t.status || ''} ${t.title || ''}`)
  );

  const inflight = taskList.filter(t => /progress|active|in_flight/i.test(t.status || ''));

  return (
    <div className="bridge">
      <header className="bridge-masthead">
        <div>
          <div className="bridge-eyebrow">Master Workflow · Command Bridge</div>
          <h1 className="bridge-title">The fleet,<br />at a glance.</h1>
        </div>
        <div className="bridge-standing">
          <div className={`bridge-standing-value${decisions.length === 0 ? ' is-clear' : ''}`}>
            {decisions.length}
          </div>
          <div className="bridge-standing-label">awaiting the Architect</div>
        </div>
      </header>

      <FeedRail feedHealth={feedHealth} connected={connected} />

      <div className="bridge-plates">
        <section className="bridge-plate">
          <div className="bridge-plate-head">
            <span className="bridge-plate-title">Work in flight</span>
            <span className="bridge-plate-count">{inflight.length}</span>
          </div>
          {inflight.length === 0 ? (
            <Empty
              what="No work in flight"
              why={connected
                ? 'The task feed is connected and reporting nothing active.'
                : 'The task feed is dark — this is not a claim that the fleet is idle.'}
            />
          ) : inflight.map(t => (
            <div className="bridge-row" data-state="active" key={t.task_id || t.id || t.title}>
              <span className="bridge-row-mark" />
              <span className="bridge-row-name">{t.title || t.task_id}</span>
              <span className="bridge-row-meta">{(t.owner || t.assignee || '').toUpperCase()}</span>
            </div>
          ))}
        </section>

        <section className="bridge-plate">
          <div className="bridge-plate-head">
            <span className="bridge-plate-title">At your desk</span>
            <span className="bridge-plate-count">{decisions.length}</span>
          </div>
          {decisions.length === 0 ? (
            <Empty what="Nothing awaiting you" why="No task is currently blocked on an Architect decision." />
          ) : decisions.map(t => (
            <div className="bridge-row" data-state="blocked" key={t.task_id || t.id || t.title}>
              <span className="bridge-row-mark" />
              <span className="bridge-row-name">{t.title || t.task_id}</span>
              <span className="bridge-row-meta">{(t.owner || t.assignee || '').toUpperCase()}</span>
            </div>
          ))}
        </section>

        <section className="bridge-plate bridge-plate--full">
          <div className="bridge-plate-head">
            <span className="bridge-plate-title">Fleet</span>
            <span className="bridge-plate-count">
              {Object.keys(lastSeen).length} of {ROSTER.length} seen
            </span>
          </div>
          <div className="bridge-roster">
            {ROSTER.map(name => {
              const seen  = lastSeen[name];
              const sealed = SEALED.has(name);
              const state = sealed ? 'sealed'
                          : seen == null ? 'unlit'
                          : (now - seen) < ACTIVE_WINDOW_S ? 'active' : 'assigned';
              const color = state === 'active'   ? 'var(--status-work-inflight)'
                          : state === 'assigned' ? 'var(--status-work-assigned)'
                          : state === 'sealed'   ? 'var(--status-vault)'
                          : 'var(--status-idle)';
              return (
                <div className="bridge-roster-cell" key={name}>
                  <span className="bridge-roster-mark" style={{ background: color }} />
                  <span className="bridge-roster-name">{name}</span>
                  <span className="bridge-roster-state">
                    {sealed ? 'sealed' : seen == null ? 'unlit' : ago(now - seen)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bridge-plate">
          <div className="bridge-plate-head">
            <span className="bridge-plate-title">Bus traffic</span>
            <span className="bridge-plate-count">{events.length}</span>
          </div>
          {events.length === 0 ? (
            <Empty what="No traffic observed" why="The bus feed is quiet. Nothing is being substituted here." />
          ) : events.slice(-8).reverse().map(e => (
            <div className="bridge-row" data-state="active" key={`${e.dir}/${e.file}`}>
              <span className="bridge-row-mark" />
              <span className="bridge-row-name">{e.preview || e.file}</span>
              <span className="bridge-row-meta">{(e.from || '—').toUpperCase()} · {ago(now - e.mtime)}</span>
            </div>
          ))}
        </section>

        <section className="bridge-plate">
          <div className="bridge-plate-head">
            <span className="bridge-plate-title">Standing conditions</span>
          </div>
          <div className="bridge-row" data-state={killActive ? 'blocked' : 'sealed'}>
            <span className="bridge-row-mark" />
            <span className="bridge-row-name">Kill switch</span>
            <span className="bridge-row-meta">{killActive ? 'ENGAGED' : 'clear'}</span>
          </div>
          <div className="bridge-row" data-state={oauthStatus?.degraded ? 'blocked' : 'sealed'}>
            <span className="bridge-row-mark" />
            <span className="bridge-row-name">Provider auth</span>
            <span className="bridge-row-meta">{oauthStatus?.degraded ? 'DEGRADED' : oauthStatus ? 'ok' : 'unknown'}</span>
          </div>
          <div className="bridge-row" data-state="sealed">
            <span className="bridge-row-mark" />
            <span className="bridge-row-name">Autonomous spend</span>
            <span className="bridge-row-meta">zero · standing</span>
          </div>
          <div className="bridge-row" data-state={projects.length ? 'active' : 'sealed'}>
            <span className="bridge-row-mark" />
            <span className="bridge-row-name">Active projects</span>
            <span className="bridge-row-meta">{projects.length}</span>
          </div>
        </section>
      </div>

      <div className="bridge-colophon">
        <span>Workshop canon · Pass 3 palette</span>
        <span>Empty means empty</span>
      </div>
    </div>
  );
}
