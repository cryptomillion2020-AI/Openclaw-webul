import { useEffect, useMemo, useState } from 'react';
import { useCityData } from '../hooks/useCityData';
import { getAgentRuntime, AGENT_RUNTIME_SOURCE } from '../lib/agent-runtime';
import { isCompleteTask, isCurrentlyActiveTask } from '../lib/task-helpers';
import { WorkshopFloor } from '../world/WorkshopFloor';
import './aicity-stations.css';

const MAKERS = [
  { id: 'overseer', name: 'OVERSEER', color: '#E8B45C' },
  { id: 'elevin', name: 'ELEVIN', color: '#7FC4C9' },
  { id: 'stan', name: 'STAN', color: '#7FC4C9' },
  { id: 'cosmos', name: 'COSMOS', color: '#8FD9A0' },
  { id: 'nexus', name: 'NEXUS', color: '#E0705F' },
  { id: 'axis', name: 'AXIS', color: '#D9793F' },
  { id: 'sage', name: 'SAGE', color: '#D9793F', silent: true },
  { id: 'navigator', name: 'NAVIGATOR', color: '#7FC4C9' },
  { id: 'tika', name: 'TIKA', color: '#7FC4C9' },
  { id: 'comms', name: 'COMMS', color: '#7FC4C9' },
  { id: 'roots', name: 'ROOTS', color: '#8FD9A0' },
  { id: 'quant', name: 'QUANT', color: '#9C8F7D' },
];

const FLEET = [
  { id: 'sevin', name: 'SEVIN', color: '#EDBD70' },
  ...MAKERS,
  { id: 'vault', name: 'VAULT', color: '#8A806F', sealed: true },
];

/* Approved Pass-3 station art, one plate bay per agent.
   Source: AICITY-PASS3-20260803T151124Z, Architect-approved 2026-08-03.
   These renderings ARE the makers — nothing here is drawn that was rendered. */
const STATION_ART = Object.fromEntries(
  FLEET.map(a => [a.id, `/ai-city/stations/${a.id}.png`]),
);

const VALID_STATES = new Set(['live', 'static', 'absent']);
const VALID_CYCLES = new Set(['day', 'night']);

function initialQueryValue(key, allowed, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(key);
  return allowed.has(value) ? value : fallback;
}

function normalizeAgent(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const alias = normalized === 'main' ? 'sevin' : normalized;
  return FLEET.some(agent => agent.id === alias) ? alias : null;
}

function taskAgent(task) {
  return normalizeAgent(task?.assignee ?? task?.agentId ?? task?.agent_id ?? task?.owner ?? task?.assigned_to);
}

function taskTitle(task) {
  return task?.title ?? task?.label ?? task?.name ?? task?.task ?? null;
}

function taskProgress(task) {
  const number = Number(task?.progress ?? task?.percent_complete ?? task?.completion);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
}

function taskState(task) {
  if (!task) return 'empty';
  if (isCompleteTask(task.status)) return 'complete';
  if (isCurrentlyActiveTask(task.status)) return 'active';
  if (task.status === 'pending') return 'pending';
  return 'unknown';
}

function representativeTaskRank(task) {
  if (isCurrentlyActiveTask(task?.status)) return 3;
  if (isCompleteTask(task?.status)) return 2;
  if (task?.status === 'pending') return 1;
  return 0;
}

function stateLabel(state) {
  return {
    complete: 'on the shelf',
    active: 'hands moving',
    pending: 'held',
    unknown: 'state unavailable',
    empty: 'tools down',
  }[state] || 'tools down';
}

function formatTime(value) {
  if (!value) return 'RECENT';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'RECENT'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AiCityPage({ tasks = [], activeTasks = [], busActivity = [], oauthStatus = {}, connected = false, cityState = null, feedHealth = {} }) {
  const cityFeedLive = feedHealth?.city_state?.state === 'LIVE';
  const cityData = useCityData({ connected, tasks, activeTasks, busActivity, oauthStatus, cityState: cityFeedLive ? cityState : null });
  const [fleetState, setFleetState] = useState(() => initialQueryValue('state', VALID_STATES, 'live'));
  const [cycleOverride, setCycleOverride] = useState(() => initialQueryValue('cycle', VALID_CYCLES, null));
  const [selectedId, setSelectedId] = useState(null);
  const cycle = cycleOverride || cityData.timeOfDay;

  const taskByAgent = useMemo(() => {
    const index = new Map();
    const liveTasks = cityData.agents.map(agent => agent.task).filter(Boolean);
    const candidates = [...liveTasks, ...(Array.isArray(activeTasks) ? activeTasks : []), ...(Array.isArray(tasks) ? tasks : [])];
    candidates.forEach(task => {
      const agent = taskAgent(task);
      if (!agent) return;
      const existing = index.get(agent);
      if (!existing || representativeTaskRank(task) > representativeTaskRank(existing)) index.set(agent, task);
    });
    return index;
  }, [activeTasks, cityData.agents, tasks]);

  const makers = useMemo(() => MAKERS.map((maker, index) => {
    const task = taskByAgent.get(maker.id) || null;
    const runtime = getAgentRuntime(maker.id);
    return {
      ...maker,
      index,
      task,
      title: taskTitle(task),
      progress: taskProgress(task),
      state: taskState(task),
      runtime: runtime?.runtime || null,
      model: runtime?.model || null,
      shortModel: runtime?.shortModel || null,
    };
  }), [taskByAgent]);

  const stations = useMemo(() => FLEET.map((agent, index) => {
    const task = taskByAgent.get(agent.id) || null;
    const runtime = getAgentRuntime(agent.id);
    return {
      ...agent,
      index,
      task,
      title: taskTitle(task),
      progress: taskProgress(task),
      /* VAULT is air-gapped: it reports nothing by design, so its state is
         asserted as sealed rather than derived from an absence of evidence. */
      state: agent.sealed ? 'sealed' : taskState(task),
      runtime: runtime?.runtime || null,
      model: runtime?.model || null,
      shortModel: runtime?.shortModel || null,
    };
  }), [taskByAgent]);

  const selected = stations.find(s => s.id === selectedId) || null;
  const counts = useMemo(() => FLEET.reduce((summary, agent) => {
    const state = taskState(taskByAgent.get(agent.id));
    if (state === 'complete') summary.complete += 1;
    if (state === 'active') summary.active += 1;
    if (state === 'pending') summary.pending += 1;
    return summary;
  }, { complete: 0, active: 0, pending: 0 }), [taskByAgent]);
  const feed = Array.isArray(cityData.busActivity) ? cityData.busActivity.slice(-4).reverse() : [];

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('state', fleetState);
    window.history.replaceState(null, '', url);
  }, [fleetState]);

  useEffect(() => {
    document.title = `The Workshop · ${fleetState.toUpperCase()}`;
  }, [fleetState]);

  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const setCycle = nextCycle => {
    setCycleOverride(nextCycle);
    const url = new URL(window.location.href);
    url.searchParams.set('cycle', nextCycle);
    window.history.replaceState(null, '', url);
  };


  const cityFeed = feedHealth?.city_state?.state || 'DEAD';

  return (
    <section
      className="city"
      data-cycle={cycle}
      data-fleet-state={fleetState}
      data-runtime-source={AGENT_RUNTIME_SOURCE.path}
      data-runtime-sha256={AGENT_RUNTIME_SOURCE.sha256}
      data-testid="aicity-district-page"
      data-city-feed-state={cityFeed}
    >
      <header className="city-masthead">
        <div>
          <div className="city-eyebrow">Master Workflow · AI-City</div>
          <h1 className="city-title">The workshop,<br />from the street.</h1>
        </div>
        <div className="city-standing">
          <div className="city-standing-value">{counts.active}</div>
          <div className="city-standing-label">hands moving</div>
        </div>
      </header>

      <div className="city-rail">
        <div className="city-rail-item" data-state={connected ? 'LIVE' : 'DEAD'}>
          <span className="city-rail-dot" />
          <span className="city-rail-name">fleet link</span>
          <span className="city-rail-state">{connected ? 'LIVE' : 'UNAVAILABLE'}</span>
        </div>
        {/* The city feed names itself when dark. A bench rendered from stale
            city_state would be a picture of a fleet that is not there. */}
        <div className="city-rail-item" data-state={cityFeed} data-testid="city-feed-health">
          <span className="city-rail-dot" />
          <span className="city-rail-name">city state</span>
          <span className="city-rail-state">{cityFeed}</span>
          <span className="city-rail-age">
            {feedHealth?.city_state?.lastMessageAt
              ? `${new Date(feedHealth.city_state.lastMessageAt).toLocaleTimeString()}`
              : 'no message received'}
          </span>
        </div>
        <div className="city-rail-item" data-state="LIVE">
          <span className="city-rail-dot" />
          <span className="city-rail-name">on the shelf</span>
          <span className="city-rail-state">{counts.complete}</span>
        </div>
        <div className="city-switch" role="group" aria-label="Day and night cycle">
          {['day', 'night'].map(value => (
            <button key={value} type="button" data-set-cycle={value}
                    aria-pressed={cycle === value} onClick={() => setCycle(value)}>{value}</button>
          ))}
        </div>
        <div className="city-switch" role="group" aria-label="Fleet state">
          {['live', 'static', 'absent'].map(value => (
            <button key={value} type="button" data-set-state={value}
                    aria-pressed={fleetState === value} onClick={() => setFleetState(value)}>{value}</button>
          ))}
        </div>
      </div>

      {/* The floor. Replaces the static bench grid: same approved plates, same
          live state, but standing in the room rather than laid out on a shelf.
          Motion here is bound to real bus traffic and real task progress —
          see WorkshopFloor.jsx for the honesty contract. */}
      <WorkshopFloor
        stations={stations}
        busActivity={cityData.busActivity || busActivity}
        cycle={cycle}
        connected={connected}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* Machine-readable bench, retained for the acceptance capture and for
          assistive tech: the floor is a scene, this is the record. */}
      <ul className="city-bench-record" data-testid="district-map">
        {stations.map(s => (
          <li
            key={s.id}
            data-agent={s.id}
            data-task={s.title || ''}
            data-progress={s.progress == null ? '' : s.progress}
            data-substrate={s.runtime || ''}
            data-model={s.model || ''}
            data-status={s.state}
            data-state={s.state}
            data-sealed={s.sealed || undefined}
          >
            {s.name} — {s.sealed ? 'sealed · back room' : stateLabel(s.state)}
          </li>
        ))}
      </ul>

      <div className="city-notes">
        <div className="city-notes-head">
          <span>Bench notes</span>
          <span>{feed.length}</span>
        </div>
        {feed.length === 0 ? (
          <div className="city-empty">
            <strong>No live events available</strong>
            Bench notes appear when the fleet link returns data. Nothing is being substituted here.
          </div>
        ) : feed.map((event, i) => (
          <div className="city-note" key={`${event.file || event.id || 'event'}-${i}`}>
            <time>{formatTime(event.ts || (event.mtime ? event.mtime * 1000 : null))}</time>
            <span>
              <strong>{event.from || 'Fleet event'}</strong>{' '}
              {event.preview || event.body || 'Event details unavailable.'}
            </span>
          </div>
        ))}
      </div>

      {selected && (
        <aside className="city-inspector" aria-label="Selected maker inspector">
          <button className="city-inspector-close" type="button"
                  onClick={() => setSelectedId(null)} aria-label="Close maker inspector">×</button>
          <img className="city-inspector-art" src={STATION_ART[selected.id]} alt={`${selected.name} at their station`} />
          <h2>{selected.name}</h2>
          <div className="city-inspector-state">{stateLabel(selected.state)}</div>
          <p className={`city-inspector-task${selected.title ? '' : ' empty'}`}>
            {selected.title || 'No active task reported'}
          </p>
          <dl className="city-inspector-meta">
            <div><dt>Runtime</dt><dd>{selected.runtime || 'Unavailable'}</dd></div>
            <div><dt>Model</dt><dd>{selected.shortModel || 'Unavailable'}</dd></div>
            <div><dt>Piece in hand</dt><dd>{selected.progress == null ? 'Unavailable' : `${selected.progress}%`}</dd></div>
            <div><dt>On the shelf</dt><dd>{selected.state === 'complete' ? 'Complete' : 'In progress'}</dd></div>
          </dl>
          {selected.silent && (
            <div id="silent-contract" className="city-empty" style={{ marginTop: 18 }}>
              <strong>Silent-spawn preserved</strong>
              The lamp and the work remain visible without rendering a maker.
            </div>
          )}
          <small>Runtime source · openclaw.json · {AGENT_RUNTIME_SOURCE.sha256.slice(0, 12)}</small>
        </aside>
      )}

      <div className="city-colophon">
        <span>Workshop canon · Pass 3 station art</span>
        <span>Empty means empty</span>
      </div>
    </section>
  );
}
