/**
 * useCityData.js — Per-agent animation state machine + WebSocket integration
 * Phase 5 FE-01 — Track A
 *
 * Manages per-agent state: active, pending_decision, idle_day, idle_night.
 * State transitions based on task activity and time of day.
 * Stub data for now; wire to WebSocket AI-City event stream in Track B pass.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Agent color palette (mirrors AiCityAssetLoader)
const AGENT_COLORS = {
  sevin:     '#F57F17',
  overseer:  '#1565C0',
  elevin:    '#1B5E20',
  tika:      '#7B1FA2',
  quant:     '#FF6F00',
  navigator: '#00BCD4',
  cosmos:    '#E91E63',
  axis:      '#E65100',
  comms:     '#00897B',
  nexus:     '#FFFFFF',
  roots:     '#558B2F',
  stan:      '#616161',
  vault:     '#37474F',
};

const AGENT_NAMES = Object.keys(AGENT_COLORS);

// Available states
const STATES = ['active', 'pending', 'idle_day', 'idle_night'];

// Grid positions (isometric layout — 4 rows, staggered)
function getDefaultPosition(index) {
  const col = index % 5;
  const row = Math.floor(index / 5);
  return {
    x: 150 + col * 140,
    y: 100 + row * 130,
  };
}

// ---------------------------------------------------------------------------
// Stub data generator (for dev before WS integration)
// ---------------------------------------------------------------------------
function generateStubAgents() {
  return AGENT_NAMES.map((name, i) => ({
    name,
    color: AGENT_COLORS[name],
    currentState: STATES[i % 4],
    position: getDefaultPosition(i),
    task: null,
    lastActive: Date.now() - Math.random() * 60000,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param {Object} options
 * @param {boolean} options.connected — WebSocket connection state (for future WS integration)
 */
export function useCityData({ connected = false } = {}) {
  const [agents, setAgents] = useState(() => generateStubAgents());
  const [buildings, setBuildings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [timeOfDay, setTimeOfDay] = useState('day'); // 'day' | 'night'
  const intervalRef = useRef(null);

  // -----------------------------------------------------------------------
  // Cycle agent states periodically (stub behavior — simulates real activity)
  // -----------------------------------------------------------------------
  useEffect(() => {
    // Rotate agent states every 8s for demo purposes
    intervalRef.current = setInterval(() => {
      setAgents((prev) =>
        prev.map((agent) => {
          // Occasionally toggle state
          const roll = Math.random();
          const currentIdx = STATES.indexOf(agent.currentState);
          let nextState;
          if (roll < 0.3) {
            // Stay in same state
            nextState = agent.currentState;
          } else if (roll < 0.5) {
            // Go to next state in cycle
            nextState = STATES[(currentIdx + 1) % STATES.length];
          } else {
            // Go to random state
            nextState = STATES[Math.floor(Math.random() * STATES.length)];
          }
          return { ...agent, currentState: nextState };
        })
      );
    }, 8000);

    return () => clearInterval(intervalRef.current);
  }, []);

  // -----------------------------------------------------------------------
  // Cycle day/night (every 30s)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const dayNightTimer = setInterval(() => {
      setTimeOfDay((prev) => (prev === 'day' ? 'night' : 'day'));
    }, 30000);
    return () => clearInterval(dayNightTimer);
  }, []);

  // -----------------------------------------------------------------------
  // API
  // -----------------------------------------------------------------------

  /**
   * Update a single agent's state (called by WS event handler in Track B).
   */
  const setAgentState = useCallback((agentName, newState, taskInfo = null) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.name === agentName
          ? { ...a, currentState: newState, task: taskInfo, lastActive: Date.now() }
          : a
      )
    );
  }, []);

  /**
   * Build stub data (5 building categories).
   */
  useEffect(() => {
    const buildingCategories = [
      { category: 'server-tower', x: 400, y: 300 },
      { category: 'lab', x: 600, y: 200 },
      { category: 'market-floor', x: 500, y: 450 },
      { category: 'bunker', x: 300, y: 400 },
      { category: 'broadcast-tower', x: 700, y: 350 },
    ];
    setBuildings(buildingCategories);
  }, []);

  return {
    agents,
    buildings,
    tasks,
    timeOfDay,
    setAgentState,
  };
}
