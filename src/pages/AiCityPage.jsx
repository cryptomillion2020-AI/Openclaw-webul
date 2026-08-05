import { useEffect, useMemo, useState } from 'react';
import { useCityData } from '../hooks/useCityData';
import { getAgentRuntime, AGENT_RUNTIME_SOURCE } from '../lib/agent-runtime';
import { isCompleteTask, isCurrentlyActiveTask } from '../lib/task-helpers';
import './AiCityPage.css';

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
  { id: 'sevin', name: 'SEVIN' },
  ...MAKERS,
  { id: 'vault', name: 'VAULT' },
];

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

  const selected = makers.find(maker => maker.id === selectedId) || null;
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

  return (
    <section
      className={`aicity-district-page cycle-${cycle}`}
      data-fleet-state={fleetState}
      data-runtime-source={AGENT_RUNTIME_SOURCE.path}
      data-runtime-sha256={AGENT_RUNTIME_SOURCE.sha256}
      data-testid="aicity-district-page"
      data-city-feed-state={feedHealth?.city_state?.state || 'DEAD'}
    >
      <header className="aicity-district-header">
        <div className="aicity-title-block">
          <span className="aicity-eyebrow">Fleet · the long bench</span>
          <h1>The <em>Workshop</em></h1>
          <p>One bench, lit from above. Each maker holds a live piece of work. Finished work stays visible on the shelf.</p>
          <p data-testid="city-feed-health">
            AI-City state · {feedHealth?.city_state?.state || 'DEAD'} · {
              feedHealth?.city_state?.lastMessageAt
                ? `last message ${new Date(feedHealth.city_state.lastMessageAt).toLocaleTimeString()}`
                : 'no message received'
            }
          </p>
        </div>
        <div className="aicity-controls">
          <div className="aicity-cycle" role="group" aria-label="Day and night cycle">
            {['day', 'night'].map(value => (
              <button key={value} type="button" data-set-cycle={value} aria-pressed={cycle === value} onClick={() => setCycle(value)}>{value}</button>
            ))}
          </div>
          <div className="aicity-state-switch" role="group" aria-label="Fleet state">
            {['live', 'static', 'absent'].map(value => (
              <button key={value} type="button" data-set-state={value} aria-pressed={fleetState === value} onClick={() => setFleetState(value)}>{value}</button>
            ))}
          </div>
        </div>
      </header>

      <dl className="aicity-eph" aria-label="Workshop totals">
        <div><dt>At the bench</dt><dd>{FLEET.length}</dd></div>
        <div><dt>Hands moving</dt><dd className="warm">{counts.active}</dd></div>
        <div><dt>On the shelf</dt><dd className="good">{counts.complete}</dd></div>
        <div><dt>Lamp lit, no maker</dt><dd className="bad">{fleetState === 'absent' ? makers.length : 1}</dd></div>
        <div><dt>Fleet link</dt><dd className={connected ? 'good' : ''}>{connected ? 'LIVE' : 'UNAVAILABLE'}</dd></div>
      </dl>

      <main className="aicity-workshop" aria-label="AI-City workshop bench">
        <div className="aicity-rafters" aria-hidden="true" />
        <div className="aicity-dust" aria-hidden="true" />
        <div className="aicity-bench" aria-hidden="true" />

        <div className="aicity-stations" data-testid="district-map">
          {makers.map(maker => (
            <button
              className={`district-card station-${maker.state}${maker.silent ? ' silent' : ''}${selectedId === maker.id ? ' selected' : ''}`}
              key={maker.id}
              type="button"
              data-agent={maker.id}
              data-task={maker.title || ''}
              data-progress={maker.progress == null ? '' : maker.progress}
              data-substrate={maker.runtime || ''}
              data-model={maker.model || ''}
              data-status={maker.state}
              style={{ '--agent': maker.color, '--station': maker.index, '--pct': maker.progress ?? 0 }}
              onClick={() => setSelectedId(maker.id)}
              aria-label={`Open ${maker.name} station; ${stateLabel(maker.state)}`}
            >
              <span className="workshop-cord" aria-hidden="true" />
              <span className="workshop-lamp" aria-hidden="true" />
              <span className="workshop-light" aria-hidden="true" />
              <span className="district-head">
                <span className="agent-name">{maker.name}</span>
                <span className="silent-wave" aria-label="activity signal; no visible maker"><i /><i /><i /></span>
              </span>
              <span className="workshop-shelf" aria-hidden="true">
                {Array.from({ length: maker.state === 'complete' ? 4 : maker.state === 'active' ? 2 : 1 }, (_, item) => <i key={item} />)}
              </span>
              <span className="workshop-maker standee" aria-label={`${maker.name} maker`}><i className="head" /><i className="body" /><i className="arm arm-left" /><i className="arm arm-right" /></span>
              <span className="workshop-piece" aria-hidden="true"><i /></span>
              <span className="district-task">{maker.title || 'No active task'}</span>
              <span className="absence-note">lamp lit · work retained</span>
            </button>
          ))}
        </div>

        <div className="aicity-sevin" aria-label="SEVIN walks the bench"><i className="sevin-head" /><i className="sevin-body" /><strong>S E V I N</strong><span>walks the bench</span></div>
        <div className="aicity-vault"><strong>VAULT</strong><span>back room · sealed</span></div>

        <div className="aicity-feed" aria-label="Operational feed">
          <h2>Bench notes</h2>
          {feed.length === 0
            ? <div className="aicity-empty-feed"><strong>No live events available</strong><span>Bench notes appear when the fleet link returns data.</span></div>
            : feed.map((event, index) => <article key={`${event.file || event.id || 'event'}-${index}`}><time>{formatTime(event.ts || (event.mtime ? event.mtime * 1000 : null))}</time><strong>{event.from || 'Fleet event'}</strong><p>{event.preview || event.body || 'Event details unavailable.'}</p></article>)}
        </div>
      </main>

      {selected && (
        <aside className="aicity-inspector on" aria-label="Selected maker inspector">
          <button className="aicity-inspector-close" type="button" onClick={() => setSelectedId(null)} aria-label="Close maker inspector">×</button>
          <div className="aicity-inspect-title"><h2>{selected.name}</h2><span>{stateLabel(selected.state)}</span></div>
          <p className={selected.title ? '' : 'empty'}>{selected.title || 'No active task reported'}</p>
          <dl className="aicity-inspect-meta">
            <div><dt>Runtime</dt><dd>{selected.runtime || 'Unavailable'}</dd></div>
            <div><dt>Model</dt><dd>{selected.shortModel || 'Unavailable'}</dd></div>
            <div><dt>Piece in hand</dt><dd>{selected.progress == null ? 'Unavailable' : `${selected.progress}%`}</dd></div>
            <div><dt>On the shelf</dt><dd>{selected.state === 'complete' ? 'Complete' : 'In progress'}</dd></div>
          </dl>
          <div className="aicity-inspect-bar"><i style={{ width: `${selected.progress ?? 0}%` }} /></div>
          {selected.silent && <div id="silent-contract" className="silent-contract"><strong>Silent-spawn preserved.</strong><br />The lamp and work remain visible without rendering a maker.</div>}
          <small>Runtime source · openclaw.json · {AGENT_RUNTIME_SOURCE.sha256.slice(0, 12)}</small>
        </aside>
      )}

      <div className="aicity-hint"><b>click</b> a maker to open · <b>esc</b> to release</div>
      <div className="aicity-tag">DIRECTION V · THE WORKSHOP</div>
    </section>
  );
}
