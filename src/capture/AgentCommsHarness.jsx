/**
 * AgentCommsHarness.jsx — capture-only mount for approval renderings.
 * Not linked from the app, not in the route table. LAYOUT SPECIMEN only.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentComms } from '../pages/AgentComms';
import '../phase4-tokens.css';
import '../App.css';

const t = Date.now();
const QUIET = { connected: false, commsByChannel: {}, onSend: () => false, addLocalEcho: () => {} };
const LOADED = {
  connected: true, onSend: () => true, addLocalEcho: () => {},
  commsByChannel: {
    status: [
      { file:'1', dir:'agent-comms-out', from:'OVERSEER', ts:t-620000, preview:'Standup tick 954 complete. 13 in progress, 19 tracked blocked, 0 ACK misses.', deliveryState:'reply' },
      { file:'2', dir:'webui-to-system', from:'WEBUI', ts:t-420000, preview:'File the updated status after the scoped verification run.', deliveryState:'written' },
      { file:'3', dir:'agent-comms-out', from:'SEVIN', ts:t-300000, preview:'Command Central approved. Workshop room is the standing treatment site-wide.', deliveryState:'reply' },
      { file:'4', dir:'agent-comms-out', from:'SAGE', ts:t-180000, preview:'Nightly harvest complete. Two pattern candidates distilled to the Enhancement Repository.', deliveryState:'reply' },
      { file:'pending-5', dir:'webui-pending', from:'You', ts:t-9000, preview:'Confirm the handoff when the bus file appears.', pending:true, deliveryState:'queued' },
    ],
    'kill-switch': [], architect: [{ file:'a', from:'SEVIN', ts:t-880000, preview:'Three recommendations surfaced for ruling.' }],
  },
};

function Interactive() {
  const [events, setEvents] = useState([]);
  window.__capturedCommsFrames = window.__capturedCommsFrames || [];
  return (
    <AgentComms
      connected
      commsByChannel={{ status: events }}
      onSend={frame => { window.__capturedCommsFrames.push(frame); return true; }}
      addLocalEcho={(channel, body, clientMessageId) => setEvents(prev => [...prev, {
        file: `pending-${clientMessageId}`, dir: 'webui-pending', from: 'You',
        ts: Date.now(), preview: body, pending: true, deliveryState: 'queued', clientMessageId,
      }])}
    />
  );
}
const params = new URLSearchParams(location.search);
document.documentElement.style.background = '#0A0806';
const state = params.get('state');
createRoot(document.getElementById('root')).render(
  state === 'interactive' ? <Interactive /> : <AgentComms {...(state === 'loaded' ? LOADED : QUIET)} />
);
