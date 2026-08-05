/**
 * useCityData — normalized AI-City view of the live WebSocket full_state surface.
 * No sample tasks, randomized activity, models, or substrate values are created here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyDebugCycleOverride } from '../components/AiCity/DebugStateCycler';
import { isCompleteTask, isCurrentlyActiveTask } from '../lib/task-helpers';

const AGENT_COLORS = {
  sevin: '#73a7ff', overseer: '#60d9ad', elevin: '#90a1ba', tika: '#9aa7bb',
  quant: '#e9b85d', navigator: '#73a7ff', cosmos: '#ff8f88', axis: '#b9c4d4',
  comms: '#7f8ea5', nexus: '#8d9eb6', roots: '#a8c46b', stan: '#7f90aa',
  vault: '#566174', sage: '#e9b85d',
};

const AGENT_NAMES = Object.keys(AGENT_COLORS);
const AGENT_ALIASES = { main: 'sevin' };

function normalizeAgent(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return AGENT_ALIASES[normalized] || (AGENT_NAMES.includes(normalized) ? normalized : null);
}

function taskAgent(task) {
  return normalizeAgent(task?.assignee ?? task?.agentId ?? task?.agent_id ?? task?.owner ?? task?.assigned_to);
}

function representativeTaskRank(task) {
  if (isCurrentlyActiveTask(task?.status)) return 3;
  if (isCompleteTask(task?.status)) return 2;
  if (task?.status === 'pending') return 1;
  return 0;
}

function selectTasks(tasks, activeTasks) {
  const selected = new Map();
  [...activeTasks, ...tasks].forEach(task => {
    const agent = taskAgent(task);
    if (!agent) return;
    const current = selected.get(agent);
    if (!current || representativeTaskRank(task) > representativeTaskRank(current)) {
      selected.set(agent, task);
    }
  });
  return selected;
}

function stateForTask(task, timeOfDay) {
  if (!task) return timeOfDay === 'night' ? 'idle_night' : 'idle_day';
  if (isCurrentlyActiveTask(task.status)) return 'active';
  if (task.status === 'pending') return 'pending';
  if (isCompleteTask(task.status)) return timeOfDay === 'night' ? 'idle_night' : 'idle_day';
  return timeOfDay === 'night' ? 'idle_night' : 'idle_day';
}

function defaultPosition(index) {
  const col = index % 5;
  const row = Math.floor(index / 5);
  return { x: 150 + col * 140, y: 100 + row * 130 };
}

export function useCityData({
  connected = false,
  tasks = [],
  activeTasks = [],
  oauthStatus = {},
  busActivity = [],
  cityState = null,
} = {}) {
  const [timeOfDay, setTimeOfDay] = useState('day');
  const [stateOverrides, setStateOverrides] = useState({});

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeActiveTasks = Array.isArray(activeTasks) ? activeTasks : [];
  const selectedTasks = useMemo(
    () => selectTasks(safeTasks, safeActiveTasks),
    [safeTasks, safeActiveTasks],
  );

  const setAgentState = useCallback((agentName, newState, taskInfo = null) => {
    const agent = normalizeAgent(agentName);
    if (!agent) return;
    setStateOverrides(previous => ({ ...previous, [agent]: { state: newState, task: taskInfo } }));
  }, []);

  const derivedAgents = useMemo(() => AGENT_NAMES.map((name, index) => {
    const task = stateOverrides[name]?.task || selectedTasks.get(name) || null;
    const profile = oauthStatus?.[name] || null;
    return {
      name,
      color: AGENT_COLORS[name],
      currentState: stateOverrides[name]?.state || stateForTask(task, timeOfDay),
      position: defaultPosition(index),
      task,
      substrate: profile?.auth_mode || null,
      fallbackMode: profile?.fallback_mode || null,
      model: null,
      connected,
    };
  }), [connected, oauthStatus, selectedTasks, stateOverrides, timeOfDay]);

  const agents = useMemo(() => {
    if (!Array.isArray(cityState?.agents)) return derivedAgents;
    const live = new Map(cityState.agents.map(agent => [
      normalizeAgent(agent.agent_id ?? agent.agentId ?? agent.name ?? agent.id),
      agent,
    ]));
    return derivedAgents.map(agent => {
      const current = live.get(agent.name);
      if (!current) return agent;
      const activity = current.activity === 'active' || current.activity === 'pending'
        ? current.activity
        : (timeOfDay === 'night' ? 'idle_night' : 'idle_day');
      const task = current.task_id ? {
        id: current.task_id,
        label: current.task_label || current.task_id,
        status: current.activity,
        agentId: agent.name,
      } : null;
      return {
        ...agent,
        presence: current.presence,
        currentState: activity,
        task,
      };
    });
  }, [cityState, derivedAgents, timeOfDay]);

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug-cycle') === '1') return applyDebugCycleOverride(setAgentState, setTimeOfDay);
    }
    return undefined;
  }, [setAgentState]);

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('debug-cycle') === '1') return undefined;
    const timer = setInterval(() => setTimeOfDay(previous => previous === 'day' ? 'night' : 'day'), 30000);
    return () => clearInterval(timer);
  }, []);

  return {
    agents,
    buildings: Array.isArray(cityState?.stations) ? cityState.stations : [],
    tasks: [...safeActiveTasks, ...safeTasks],
    busActivity: Array.isArray(cityState?.bus_routes) ? cityState.bus_routes : (Array.isArray(busActivity) ? busActivity : []),
    timeOfDay,
    setAgentState,
  };
}
