/**
 * DashboardHarness.jsx — capture-only mount for approval renderings.
 *
 * Reached exclusively through /capture-dashboard.html, which is not linked from
 * the app and not part of the App.jsx route table. The payload below is a
 * LAYOUT SPECIMEN for judging density — it is not sample data, it never reaches
 * a shipped page, and Dashboard itself still contains no seeded values.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from '../pages/Dashboard';
import '../phase4-tokens.css';
import '../App.css';

const now = Date.now() / 1000;

const QUIET = {
  connected: false,
  killActive: false,
  mode3Conditions: null,
  mode3Enabled: false,
  onSend: () => {},
  busActivity: [],
  commsByChannel: {},
  tasks: [],
  activeProjects: [],
  activeTasks: [],
  oauthStatus: null,
  feedHealth: null,
};

const LOADED = {
  connected: true,
  killActive: false,
  mode3Conditions: { paper_mode_confirmed: false },
  mode3Enabled: false,
  onSend: () => {},
  oauthStatus: { degraded: false },
  activeProjects: [
    { id: 'webui',   title: 'WebUI Phase 4 — page canon pass', status: 'in_progress', progress: 34 },
    { id: 'loadbal', title: 'Fleet load balancing — Stage 1 sensor', status: 'in_progress', progress: 60 },
    { id: 'memory',  title: 'Persistent session memory — Wave 1', status: 'blocked' },
  ],
  feedHealth: {
    bus_activity:   { state: 'LIVE',  lastMessageAt: now - 12 },
    task_update:    { state: 'LIVE',  lastMessageAt: now - 48 },
    market_context: { state: 'STALE', lastMessageAt: now - 1900 },
    comms:          { state: 'DEAD',  lastMessageAt: now - 21600 },
  },
  tasks: [
    { task_id: 'MEM-WAVE-2',   title: 'Memory Wave 2 enrolment — awaiting Architect ruling', status: 'awaiting_architect', owner: 'sevin',     since: now - 82800 },
    { task_id: 'LB-STAGE-2',   title: 'Load balancer Stage 2 — approval to build',           status: 'awaiting_approval',  owner: 'sevin',     since: now - 9400 },
    { task_id: 'BUS-ARCHIVAL', title: 'Bus archival Phase B — live mutation authorization',  status: 'awaiting_decision',  owner: 'overseer',  since: now - 1500 },
    { task_id: 'WEBUI-LANE-A-C', title: 'WebUI data feeds + feed-health watchdog',  status: 'in_progress', owner: 'elevin' },
    { task_id: 'WEBUI-CC',       title: 'Command Central to approved Workshop canon', status: 'in_progress', owner: 'sevin' },
    { task_id: 'AICITY-CITY-STATE', title: 'AI-City city_state server emitter',      status: 'in_progress', owner: 'elevin' },
    { task_id: 'QUANT-MODE3',    title: 'QUANT Mode 3 gates — 5 conditions unmet',   status: 'blocked',     owner: 'quant' },
    { task_id: 'SOII-C3',        title: 'SOII corpus expansion re-index',            status: 'blocked',     owner: 'stan' },
  ],
  busActivity: [
    { dir: 'elevin-to-sevin',    file: 'a.md', from: 'ELEVIN',    mtime: now - 40,   preview: 'DONE — WebUI Lane A/C, 7 of 7 PASS, Playwright 6/6' },
    { dir: 'overseer-to-elevin', file: 'b.md', from: 'OVERSEER',  mtime: now - 300,  preview: 'AUTHORIZATION (PHASED) — bus archival, Phase A approved' },
    { dir: 'elevin-to-overseer', file: 'c.md', from: 'ELEVIN',    mtime: now - 420,  preview: 'ESCALATION — production authorization required' },
    { dir: 'sevin-to-elevin',    file: 'd.md', from: 'SEVIN',     mtime: now - 900,  preview: 'DIRECTIVE — bus archival, Stage 2 critical path' },
    { dir: 'navigator-to-sevin', file: 'e.md', from: 'NAVIGATOR', mtime: now - 3400, preview: 'Memory persistence risk + cost — 98% concurrence' },
    { dir: 'sage-to-overseer',   file: 'f.md', from: 'SAGE',      mtime: now - 7200, preview: 'Nightly harvest complete' },
  ],
  commsByChannel: {},
};

function InteractiveDashboard() {
  const [commsByChannel, setCommsByChannel] = useState({});
  window.__capturedDashboardFrames = window.__capturedDashboardFrames || [];
  const onSend = frame => {
    window.__capturedDashboardFrames.push(frame);
    setTimeout(() => setCommsByChannel(prev => ({
      ...prev,
      [frame.channel]: [{
        file: 'confirmed.md', dir: `webui-to-${frame.channel}`, from: 'WEBUI',
        mtime: Date.now() / 1000, ts: new Date().toISOString(), preview: frame.body,
        clientMessageId: frame.clientMessageId, pending: false, deliveryState: 'written',
      }],
    })), 80);
    return true;
  };
  return <Dashboard {...QUIET} connected onSend={onSend} commsByChannel={commsByChannel} />;
}

const params = new URLSearchParams(location.search);
const state = params.get('state');
const mode = state === 'loaded' ? LOADED : QUIET;

document.documentElement.style.background = '#0B0906';
createRoot(document.getElementById('root')).render(
  state === 'interactive' ? <InteractiveDashboard /> : <Dashboard {...mode} />
);
