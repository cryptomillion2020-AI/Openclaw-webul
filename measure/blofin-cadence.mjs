// READ-ONLY measurement of BloFin PUBLIC market feeds. No auth, no orders, no ledger.
// Measures: REST ticker update cadence (distinct exchange ts deltas), WS push inter-arrival,
// candle cadence, for a HIGH-liquidity and a LOW-liquidity perp. Clock: single-host wall clock
// (Date.now); exchange 'ts' is BloFin server time — cross-clock skew NOT corrected (stated limit).
import WebSocket from '../runtime/vendor/ws/wrapper.mjs';

const REST = 'https://openapi.blofin.com';
const WS = 'wss://openapi.blofin.com/ws/public';
const now = () => Date.now();
const pctl = (arr, p) => { if (!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(p/100*s.length))]; };
const stats = (arr) => arr.length ? { n:arr.length, min:Math.min(...arr), p50:pctl(arr,50), p95:pctl(arr,95), p99:pctl(arr,99), max:Math.max(...arr), mean:Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) } : { n:0 };

async function getJSON(path) {
  const t0 = now();
  const r = await fetch(REST + path, { headers: { 'accept':'application/json' } });
  const t1 = now();
  const rateHeaders = {};
  for (const [k,v] of r.headers) if (/rate|limit|remain/i.test(k)) rateHeaders[k]=v;
  const body = await r.json();
  return { status:r.status, rtt:t1-t0, rateHeaders, body };
}

// Pick a high-liq (BTC-USDT) and a low-liq perp (lowest 24h volume from the tickers list).
async function pickSymbols() {
  const { body } = await getJSON('/api/v1/market/tickers');
  const rows = (body.data||[]).filter(r=>r.instId && r.instId.endsWith('-USDT'));
  const withVol = rows.map(r=>({ instId:r.instId, vol: Number(r.volCurrency24h ?? r.vol24h ?? r.volCurrency ?? 0) }))
                      .filter(r=>Number.isFinite(r.vol));
  withVol.sort((a,b)=>a.vol-b.vol);
  const low = (withVol.find(r=>r.vol>0) || withVol[0] || {instId:'UNKNOWN'}).instId;
  return { high:'BTC-USDT', low, universe: rows.length };
}

// REST cadence: sample the ticker fast; the exchange 'ts' changes at the true update cadence.
async function restCadence(instId, ms=25000, interval=400) {
  const seenTs = []; const rtts = []; let rate = {};
  const t0 = now();
  while (now()-t0 < ms) {
    try {
      const { body, rtt, rateHeaders } = await getJSON(`/api/v1/market/tickers?instId=${instId}`);
      rtts.push(rtt); rate = rateHeaders;
      const row = (body.data||[])[0];
      if (row && row.ts) { const ts=Number(row.ts); if (seenTs[seenTs.length-1]!==ts) seenTs.push(ts); }
    } catch {}
    await new Promise(r=>setTimeout(r, interval));
  }
  const deltas = []; for (let i=1;i<seenTs.length;i++) deltas.push(seenTs[i]-seenTs[i-1]);
  return { instId, sampled_ms:ms, poll_interval_ms:interval, distinct_updates:seenTs.length, rtt_ms:stats(rtts), update_delta_ms:stats(deltas), rate_headers:rate };
}

// WS cadence: subscribe to the tickers channel; inter-arrival of pushes = live cadence.
function wsCadence(instId, ms=25000) {
  return new Promise((resolve) => {
    const arrivals = []; let last=null; let opened=false; let err=null;
    const ws = new WebSocket(WS, { handshakeTimeout: 8000 });
    const done = () => { try{ws.close();}catch{} const deltas=[]; for(let i=1;i<arrivals.length;i++)deltas.push(arrivals[i]-arrivals[i-1]);
      resolve({ instId, transport:'websocket', reachable:opened, error:err, messages:arrivals.length, interarrival_ms:stats(deltas) }); };
    const timer = setTimeout(done, ms+9000);
    ws.on('open', ()=>{ opened=true; ws.send(JSON.stringify({op:'subscribe',args:[{channel:'tickers',instId}]})); setTimeout(()=>{clearTimeout(timer);done();}, ms); });
    ws.on('message', (raw)=>{ let m; try{m=JSON.parse(raw.toString());}catch{return;} if(m.data&&m.arg&&m.arg.channel==='tickers'){ arrivals.push(now()); } });
    ws.on('error', (e)=>{ err=String(e&&e.message||e); if(!opened){clearTimeout(timer);done();} });
  });
}

async function candleCadence(instId) {
  const out = {};
  for (const bar of ['1m','5m','15m','1H']) {
    try { const { body } = await getJSON(`/api/v1/market/candles?instId=${instId}&bar=${bar}&limit=3`);
      const rows = body.data||[]; out[bar] = rows.length ? { rows:rows.length, latest_open_ts:Number(rows[0][0]), span_ms: rows.length>1 ? Number(rows[0][0])-Number(rows[1][0]) : null } : { rows:0 };
    } catch(e){ out[bar]={error:String(e&&e.message||e)}; }
  }
  return out;
}

(async () => {
  const result = { measured_at:new Date().toISOString(), clock:'single-host Date.now(); exchange ts=BloFin server time, cross-clock skew uncorrected', rest_base:REST, ws_base:WS };
  const { high, low, universe } = await pickSymbols();
  result.universe_usdt_instruments = universe;
  result.symbols = { high_liquidity:high, low_liquidity:low };
  console.error(`[measure] symbols high=${high} low=${low} universe=${universe}`);

  result.rest_cadence = { high: await restCadence(high), low: await restCadence(low) };
  console.error('[measure] REST cadence done');
  result.ws_cadence = { high: await wsCadence(high), low: await wsCadence(low) };
  console.error('[measure] WS cadence done');
  result.candle_cadence = { high: await candleCadence(high) };
  console.error('[measure] candle cadence done');

  console.log(JSON.stringify(result, null, 2));
})().catch(e=>{ console.log(JSON.stringify({fatal:String(e&&e.stack||e)})); process.exit(1); });
