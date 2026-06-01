/**
 * DebugStateCycler.js — Deterministic AI City state cycler for dev capture
 * Phase 5 FE-01 — Track A | AICITY Phase 2 · Condition 5
 *
 * OVERRIDES the normal stub state cycling with a deterministic sequence:
 *   idle_day → idle_night → active → pending
 *
 * Activation: Add `?debug-cycle=1` to the page URL.
 * Guard: Entire file's logic is unreachable in production builds via import.meta.env.DEV.
 *
 * Usage (wired in useCityData.js):
 *   import { applyDebugCycleOverride } from '../components/AiCity/DebugStateCycler';
 *   if (import.meta.env.DEV) {
 *     applyDebugCycleOverride(setAgentState, setTimeOfDay);
 *   }
 */

const CYCLE_SEQUENCE = [
  { state: 'idle_day',   timeOfDay: 'day',   label: 'idle_day' },
  { state: 'idle_night', timeOfDay: 'night', label: 'idle_night' },
  { state: 'active',     timeOfDay: 'day',   label: 'active' },
  { state: 'pending',    timeOfDay: 'day',   label: 'pending' },
];

const PAUSE_MS = 3000; // 3s per state

// Minimum agents that MUST be rendered for the artifact package
const REQUIRED_AGENTS = ['sevin', 'overseer', 'elevin'];

// All agents in the system
const ALL_AGENTS = [
  'sevin', 'overseer', 'elevin', 'tika', 'quant',
  'navigator', 'cosmos', 'axis', 'comms', 'nexus',
  'roots', 'stan', 'vault',
];

/**
 * Apply deterministic debug cycle override.
 *
 * @param {Function} setAgentState — from useCityData, signature: (name, state, task?)
 * @param {Function} setTimeOfDay — from useCityData, signature: (day|night)
 */
export function applyDebugCycleOverride(setAgentState, setTimeOfDay) {
  // Guard: production build — entire function is a no-op
  if (!import.meta.env.DEV) return;

  // Guard: only activate if ?debug-cycle=1 is present in URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug-cycle') !== '1') return;

  console.log('[DebugStateCycler] Activated — ?debug-cycle=1 detected');
  console.log(`[DebugStateCycler] Sequence: ${CYCLE_SEQUENCE.map(s => s.label).join(' → ')}`);
  console.log(`[DebugStateCycler] Pause: ${PAUSE_MS}ms per state`);
  console.log(`[DebugStateCycler] Required agents: ${REQUIRED_AGENTS.join(', ')}`);

  let stepIndex = 0;
  let timer = null;

  function cycleAgents(step) {
    const { state, timeOfDay, label } = step;

    console.log(`[DebugStateCycler] → ${label} (time: ${timeOfDay})`);

    // Set time of day
    setTimeOfDay(timeOfDay);

    // Cycle all agents into the current state
    ALL_AGENTS.forEach((agentName) => {
      setAgentState(agentName, state, null);
    });

    // Schedule next step
    stepIndex = (stepIndex + 1) % CYCLE_SEQUENCE.length;
    timer = setTimeout(() => cycleAgents(CYCLE_SEQUENCE[stepIndex]), PAUSE_MS);
  }

  // Start the cycle immediately with the first state
  cycleAgents(CYCLE_SEQUENCE[0]);

  // Return a cleanup function (for useEffect return)
  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    console.log('[DebugStateCycler] Cleaned up');
  };
}
