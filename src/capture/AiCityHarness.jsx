/**
 * AiCityHarness.jsx — capture-only mount for approval renderings.
 * Not linked from the app, not in the route table. LAYOUT SPECIMEN only.
 */
import { createRoot } from 'react-dom/client';
import AiCityPage from '../pages/AiCityPage';
import '../phase4-tokens.css';
import '../App.css';

const now = Date.now();
const QUIET = { connected: false, tasks: [], activeTasks: [], busActivity: [], feedHealth: {} };
const LOADED = {
  connected: true,
  feedHealth: { city_state: { state: 'LIVE', lastMessageAt: now - 6000 } },
  tasks: [
    { task_id: 'T1', title: 'Bus archival — archive verb + retention policy', status: 'in_progress', owner: 'elevin', progress: 55 },
    { task_id: 'T2', title: 'Fleet load sensor Stage 1 calibration', status: 'in_progress', owner: 'navigator', progress: 30 },
    { task_id: 'T3', title: 'Standup tick 954 — fleet coordination', status: 'in_progress', owner: 'overseer', progress: 80 },
    { task_id: 'T4', title: 'Source verification — four citations', status: 'complete', owner: 'tika' },
    { task_id: 'T5', title: 'Nightly pattern harvest', status: 'complete', owner: 'sage' },
    { task_id: 'T6', title: 'SOII corpus expansion re-index', status: 'pending', owner: 'stan' },
    { task_id: 'T7', title: 'Mode 3 gates — five conditions unmet', status: 'pending', owner: 'quant' },
  ],
  activeTasks: [],
  busActivity: [
    { file: 'a', from: 'ELEVIN',   mtime: (now - 40000) / 1000,  preview: 'DONE — WebUI Lane A/C. 7 of 7 PASS.' },
    { file: 'b', from: 'OVERSEER', mtime: (now - 300000) / 1000, preview: 'AUTHORIZATION (PHASED) — bus archival Phase A approved.' },
    { file: 'c', from: 'SAGE',     mtime: (now - 720000) / 1000, preview: 'Nightly harvest complete.' },
    { file: 'd', from: 'TIKA',     mtime: (now - 990000) / 1000, preview: 'Three of four citations resolve; fourth marked UNVERIFIED.' },
  ],
};
const params = new URLSearchParams(location.search);
document.documentElement.style.background = '#0A0806';
createRoot(document.getElementById('root')).render(
  <AiCityPage {...(params.get('state') === 'loaded' ? LOADED : QUIET)} />
);
