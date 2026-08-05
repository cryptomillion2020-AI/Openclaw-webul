/**
 * BridgeHarness.jsx — capture-only mount for approval renderings.
 *
 * Reached exclusively through /capture.html, which is not linked from the app
 * and not part of the App.jsx route table. The payload below is a LAYOUT
 * SPECIMEN for judging density — it is not sample data, it never reaches a
 * shipped page, and Bridge itself still contains no seeded values.
 */
import { createRoot } from 'react-dom/client';
import { Bridge } from '../pages/Bridge';
import '../phase4-tokens.css';
import '../App.css';

const now = Date.now() / 1000;

const QUIET = {
  connected: false,
  killActive: false,
  busActivity: [],
  tasks: [],
  activeProjects: [],
  activeTasks: [],
  oauthStatus: null,
  feedHealth: null,
};

const LOADED = {
  connected: true,
  killActive: false,
  oauthStatus: { degraded: false },
  activeProjects: [{ id: 'webui' }, { id: 'p037' }, { id: 'qnxt' }],
  feedHealth: {
    bus_activity:   { state: 'LIVE',  lastMessageAt: now - 12 },
    task_update:    { state: 'LIVE',  lastMessageAt: now - 48 },
    market_context: { state: 'STALE', lastMessageAt: now - 1900 },
    comms:          { state: 'DEAD',  lastMessageAt: now - 21600 },
  },
  tasks: [
    { task_id: 'WEBUI-LANE-A-C-20260804', title: 'WebUI data feeds + feed-health watchdog', status: 'in_progress', owner: 'elevin' },
    { task_id: 'WEBUI-CANON-BRIDGE',      title: 'Bridge page to approved Workshop canon',  status: 'in_progress', owner: 'sevin' },
    { task_id: 'AICITY-CITY-STATE',       title: 'AI-City city_state server emitter',       status: 'in_progress', owner: 'elevin' },
    { task_id: 'P037-BUNDLE',             title: 'P-037 fleet plumbing — awaiting Architect decision', status: 'awaiting_architect', owner: 'overseer' },
  ],
  busActivity: [
    { dir: 'overseer-to-sevin',  file: 'a.md', from: 'ELEVIN',    mtime: now - 40,   preview: 'ACK WEBUI-LANE-A-C — ACTION_INITIATED, 92% confidence' },
    { dir: 'sevin-to-overseer',  file: 'b.md', from: 'SEVIN',     mtime: now - 180,  preview: 'CC: Lane A/C dispatch attribution' },
    { dir: 'overseer-to-sevin',  file: 'c.md', from: 'OVERSEER',  mtime: now - 900,  preview: 'Standing poll — no unread anomalies' },
    { dir: 'navigator-to-sevin', file: 'd.md', from: 'NAVIGATOR', mtime: now - 3400, preview: 'P-037 item 2-4 diagnosis in progress' },
    { dir: 'sage-to-overseer',   file: 'e.md', from: 'SAGE',      mtime: now - 7200, preview: 'Nightly harvest complete' },
  ],
};

const params = new URLSearchParams(location.search);
const mode = params.get('state') === 'loaded' ? LOADED : QUIET;

/* Architectural variant for Architect selection: A arcade, B mezzanine,
   C window. Absent => the approved flat canon, unchanged. */
const arch = params.get('arch') || null;

document.documentElement.style.background = '#0B0906';
createRoot(document.getElementById('root')).render(<Bridge {...mode} arch={arch} />);
