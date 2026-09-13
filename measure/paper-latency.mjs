// READ-ONLY micro-benchmark of the CURRENT paper fill engine's in-process transaction latency.
// Isolated tmp ledger (NO user-ledger contact). Measures display->confirm->fill compute cost:
//   - requestApproval() : the "confirm" step (capability gate)
//   - transaction(submit): order admission
//   - transaction(settle): the paper FILL (SQLite BEGIN IMMEDIATE commit)
// Clock: single-host process.hrtime.bigint() (monotonic, ns) — pure compute, no network.
// This is the ONLY controllable portion of end-to-end delay in the CURRENT arch; the quote->display
// portion is a 15s REST poll of a file-backed snapshot (measured separately) + out-of-band publish.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PaperSimulation } from '../runtime/paper-simulation.mjs';
import { createPaperActionApprovals } from '../runtime/paper-capability.mjs';

const pctl = (arr, p) => { const s=[...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(p/100*s.length))]; };
const stats = (arr) => arr.length ? {
  n: arr.length, min: +Math.min(...arr).toFixed(3), p50: +pctl(arr,50).toFixed(3),
  p95: +pctl(arr,95).toFixed(3), p99: +pctl(arr,99).toFixed(3), max: +Math.max(...arr).toFixed(3),
  mean: +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(3)
} : { n:0 };
const msSince = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;

const dir = mkdtempSync(path.join(os.tmpdir(), 'paper-latency-'));
let now = Date.now();
const gate = createPaperActionApprovals({ now: () => now });
const l = new PaperSimulation({ filename: path.join(dir, 'ledger.sqlite'), verifyApproval: gate.verifyApproval, now: () => now });
const principal = { authenticated: true, subject: 'bench-owner' };
const state = () => ({ perp: { source:'blofin_public', instrument_class:'crypto_perp', state:'fresh',
  generated_at: new Date(now).toISOString(), ttl_seconds: 30,
  rows: [{ symbol:'BTC-USDT', state:'fresh', bid:'100', ask:'101', mark:'100.5', funding_rate:'0.0001', observed_at_ms: now }] } });
const draft = { mode:'paper', instrument_class:'crypto_perp', symbol:'BTC-USDT', side:'buy', type:'market', quantity:'0.001', price:null };

const N = 500, WARM = 50;
const confirmT = [], submitT = [], settleT = [], e2eT = [];
let key = 0;

for (let i = 0; i < N + WARM; i++) {
  const warm = i < WARM;
  // Prune the approval receipt set: advance the sim wall-clock past the 60s TTL every 200 iters
  // (3 approvals/iter -> <600 live between prunes, under the 1000 cap). Done at iteration TOP so
  // no approval used this iteration is prematurely expired. Does not touch the hrtime latency clock.
  if (i > 0 && i % 200 === 0) now += 61000;
  const e0 = process.hrtime.bigint();

  const c0 = process.hrtime.bigint();
  const approval = await gate.requestApproval({ principal, action:'submit', draft, input:{ draft }, confirmation:'CONFIRM PAPER' });
  const cMs = msSince(c0);

  const s0 = process.hrtime.bigint();
  const a = l.transaction(principal, 'k-submit-'+(++key), 'submit', { draft, approval }, state());
  const sMs = msSince(s0);

  // confirm+fill the resulting order (the paper FILL path)
  const fApproval = await gate.requestApproval({ principal, action:'settle', input:{ id:a.order.id }, confirmation:'CONFIRM PAPER' });
  const f0 = process.hrtime.bigint();
  const filled = l.transaction(principal, 'k-settle-'+key, 'settle', { id:a.order.id, approval:fApproval }, state());
  const fMs = msSince(f0);
  const eMs = msSince(e0);

  // unwind so the ledger doesn't grow unbounded across N iterations
  const rApproval = await gate.requestApproval({ principal, action:'reduce', input:{ id:filled.position.id, quantity:'0.001' }, confirmation:'CONFIRM PAPER' });
  l.transaction(principal, 'k-reduce-'+key, 'reduce', { id:filled.position.id, quantity:'0.001', approval:rApproval }, state());

  if (!warm) { confirmT.push(cMs); submitT.push(sMs); settleT.push(fMs); e2eT.push(eMs); }
}

const result = {
  measured_at: new Date().toISOString(),
  engine: 'PaperSimulation (CURRENT live engine; extends PaperLedger; SQLite BEGIN IMMEDIATE, BigInt scale-12)',
  clock: 'process.hrtime.bigint() monotonic ns; pure in-process compute; NO network, NO quote-poll',
  isolation: 'tmp ledger, no user-ledger contact',
  samples: N, warmup: WARM,
  scope_note: 'This is the display->confirm->fill COMPUTE portion only. Quote->display in CURRENT arch is a 15000ms client REST poll of a file-backed snapshot (see blofin-cadence-result.json rest RTT) + out-of-band publisher cadence (UNMEASURED at source).',
  confirm_requestApproval_ms: stats(confirmT),
  submit_transaction_ms: stats(submitT),
  settle_fill_transaction_ms: stats(settleT),
  end_to_end_confirm_to_fill_ms: stats(e2eT),
};
console.log(JSON.stringify(result, null, 2));
l.close();
rmSync(dir, { recursive:true, force:true });
