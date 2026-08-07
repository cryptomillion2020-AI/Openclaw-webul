/**
 * TeamResearchHarness.jsx — capture-only mount for A4 verification.
 * Not linked from the app, not in the route table. LAYOUT SPECIMEN only.
 *
 * Feeds synthetic busActivity shaped exactly like App.jsx's handleMessage
 * output for research_delta / research_result / research_result_blocked,
 * to verify the query-card pipeline (intake -> assignment -> result) renders
 * correctly without needing a live websocket round trip.
 */
import { createRoot } from 'react-dom/client';
import { TeamResearch } from '../pages/TeamResearch';
import '../phase4-tokens.css';
import '../App.css';
import '../pages.css';

const t = Date.now() / 1000;

const BUS_ACTIVITY = [
  // Query 1: awaiting result (dispatched only, no result event yet)
  {
    file: 'q1.md', dir: 'webui-to-sevin', from: 'WEBUI', mtime: t - 300,
    ts: new Date((t - 300) * 1000).toISOString(),
    preview: 'What does a CRM pipeline/stage engine actually need to track?',
    routing: 0, selected_agents: [],
    query_id: 'q1', stage: 'dispatched', dedup: null,
  },
  // Query 2: complete, with sources + artifact path
  {
    file: 'q2.md', dir: 'webui-to-research', from: 'WEBUI', mtime: t - 600,
    ts: new Date((t - 600) * 1000).toISOString(),
    preview: 'Salesforce teardown: what is table stakes vs bloat?',
    routing: 1, selected_agents: ['TIKA'],
    query_id: 'q2', stage: 'dispatched',
    dedup: { query_id: 'q0', status: 'complete', artifact_path: 'workspace/knowledge/crm/videos/ntZbRd-DPII-NOTES.md', age_days: 2.3 },
  },
  {
    file: 'q2-reply.md', dir: 'overseer-to-sevin', from: 'TIKA', mtime: t - 60,
    ts: new Date((t - 60) * 1000).toISOString(),
    query_id: 'q2', stage: 'complete', resultType: 'research_result',
    preview: 'Table stakes: contacts, opportunities/pipeline stages, activity log. Bloat for a solo/small-team desktop CRM: territory management, Einstein forecasting, multi-org setup.',
    sources: ['[03:52]', 'https://www.salesforce.com/crm/what-is-crm/'],
    artifact_path: 'workspace/knowledge/crm/research/TIKA-SALESFORCE-TEARDOWN.md',
  },
  // Query 3: blocked — no citation in the reply
  {
    file: 'q3.md', dir: 'webui-to-all-agents', from: 'WEBUI', mtime: t - 900,
    ts: new Date((t - 900) * 1000).toISOString(),
    preview: 'Is Postgres or SQLite the right local store for a single-user desktop CRM?',
    routing: 2, selected_agents: [],
    query_id: 'q3', stage: 'dispatched', dedup: null,
  },
  {
    file: 'q3-reply.md', dir: 'overseer-to-sevin', from: 'ELEVIN', mtime: t - 30,
    ts: new Date((t - 30) * 1000).toISOString(),
    query_id: 'q3', stage: 'blocked_no_citation', resultType: 'research_result_blocked',
    reason: 'reply contained no detectable citation (URL, [HH:MM] timestamp, or Source: line)',
  },
];

const QUIET = { connected: false, busActivity: [], onSend: () => {} };
const LOADED = { connected: true, busActivity: BUS_ACTIVITY, onSend: (m) => console.log('onSend', m) };

const params = new URLSearchParams(location.search);
document.documentElement.style.background = '#0A0806';
createRoot(document.getElementById('root')).render(
  <TeamResearch {...(params.get('state') === 'loaded' ? LOADED : QUIET)} />
);
