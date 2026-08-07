/**
 * AgentCommsHarness.jsx — capture-only mount for approval renderings.
 * Not linked from the app, not in the route table. LAYOUT SPECIMEN only.
 */
import { createRoot } from 'react-dom/client';
import { AgentComms } from '../pages/AgentComms';
import '../phase4-tokens.css';
import '../App.css';

const t = Date.now();
const QUIET = { connected: false, commsByChannel: {}, onSend: () => {}, addLocalEcho: () => {} };
const LOADED = {
  connected: true, onSend: () => {}, addLocalEcho: () => {},
  commsByChannel: {
    status: [
      { file:'1', from:'OVERSEER', ts:t-620000, preview:'Standup tick 954 complete. 13 in progress, 19 tracked blocked, 0 ACK misses.' },
      { file:'2', from:'ELEVIN',   ts:t-420000, preview:'Bus archival Phase A underway — archive verb built, staged test pending. No live mutation.' },
      { file:'3', from:'SEVIN',    ts:t-300000, preview:'Command Central approved. Workshop room is the standing treatment site-wide.' },
      { file:'4', from:'SAGE',     ts:t-180000, preview:'Nightly harvest complete. Two pattern candidates distilled to the Enhancement Repository.' },
      { file:'5', from:'SEVIN',    ts:t-9000,   preview:'Agent Comms rebuilt in the room. Data binding unchanged — this page never faked anything.', pending:true },
    ],
    'kill-switch': [], architect: [{ file:'a', from:'SEVIN', ts:t-880000, preview:'Three recommendations surfaced for ruling.' }],
  },
};
const params = new URLSearchParams(location.search);
document.documentElement.style.background = '#0A0806';
createRoot(document.getElementById('root')).render(
  <AgentComms {...(params.get('state') === 'loaded' ? LOADED : QUIET)} />
);
