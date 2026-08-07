/**
 * NetworkHarness.jsx — capture-only mount for approval renderings.
 * Not linked from the app, not in the App.jsx route table. The payload is a
 * LAYOUT SPECIMEN for judging density — it never reaches a shipped page, and
 * Network itself contains no seeded values.
 */
import { createRoot } from 'react-dom/client';
import { Network } from '../pages/Network';
import '../phase4-tokens.css';
import '../App.css';

const now = Date.now() / 1000;

const QUIET = {
  connected: false, busActivity: [], onSend: () => {},
  commsAnomaly: null, feedHealth: null,
};

const LOADED = {
  connected: true,
  onSend: () => {},
  commsAnomaly: { ts: '17:32:51', reason: 'ELEVIN escalated to OVERSEER without SEVIN attribution — routing reviewed, no action required.' },
  feedHealth: {
    bus_activity: { state: 'LIVE', lastMessageAt: now - 12 },
    comms:        { state: 'DEAD', lastMessageAt: now - 21600 },
  },
  busActivity: [
    { dir: 'elevin-to-sevin',    file: 'a.md', from: 'ELEVIN',    mtime: now - 40,   preview: 'DONE — WebUI Lane A/C. 7 of 7 PASS, Playwright 6/6, build exit 0.' },
    { dir: 'overseer-to-elevin', file: 'b.md', from: 'OVERSEER',  mtime: now - 300,  preview: 'AUTHORIZATION (PHASED) — bus archival. Phase A approved; live mutation gated on Stage 7 evidence.' },
    { dir: 'elevin-to-overseer', file: 'c.md', from: 'ELEVIN',    mtime: now - 420,  preview: 'ESCALATION — production authorization required before live bus.py mutation.' },
    { dir: 'sevin-to-elevin',    file: 'd.md', from: 'SEVIN',     mtime: now - 900,  preview: 'DIRECTIVE — bus archival is the Stage 2 critical path. Read-state and priority gate archival; age alone does not.' },
    { dir: 'navigator-to-sevin', file: 'e.md', from: 'NAVIGATOR', mtime: now - 3400, preview: 'Memory persistence risk + cost — 98% concurrence. Recall is evidence discovery, never recovered context.' },
    { dir: 'sage-to-overseer',   file: 'f.md', from: 'SAGE',      mtime: now - 7200, preview: 'Nightly harvest complete. Two pattern candidates distilled to the Enhancement Repository.' },
    { dir: 'tika-to-overseer',   file: 'g.md', from: 'TIKA',      mtime: now - 11000, preview: 'Source verification returned — three of four citations resolve; fourth is paywalled and marked UNVERIFIED.' },
  ],
};

const params = new URLSearchParams(location.search);
const mode = params.get('state') === 'loaded' ? LOADED : QUIET;
document.documentElement.style.background = '#0A0806';
createRoot(document.getElementById('root')).render(<Network {...mode} />);
