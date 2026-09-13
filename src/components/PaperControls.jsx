import { useEffect, useMemo, useRef, useState } from 'react';
import { searchCatalog, resolveInstrument, catalogState, INSTRUMENT_CLASS, BLOFIN_CATALOG_COUNTS, BLOFIN_CATALOG_PROVENANCE } from '../feeds/blofinCatalog.js';

const human=s=>String(s).replaceAll('_',' ');
const PAGE=20;
// Refresh error kinds are distinguished so auth-expiry never reads as a generic
// failure. Transport rejections (no HTTP response) are 'network'; a 401 or an
// origin refusal is 'auth'; anything else that returned a coded body is 'api'.
function classifyError(e){
  if(e?.httpStatus===401||e?.code==='authentication_required'||e?.code==='origin_refused')return 'auth';
  if(e?.httpStatus)return 'api';
  return 'network';
}
const REFRESH_HINT={
  auth:'Session expired or not authenticated. Re-open the paper workspace to re-establish the session; no ledger value is inferred.',
  network:'Could not reach the paper API (network/transport). No cached or substituted ledger value is shown.',
  api:'The paper API returned an error. The exact code is shown above; no value is inferred.',
};

export function PaperControls({onNamespace}){
 const [status,setStatus]=useState(null),[ledger,setLedger]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmation,setConfirmation]=useState(false);
 const [draft,setDraft]=useState({symbol:'BTC-USDT',instrument_class:INSTRUMENT_CLASS.PERP,side:'buy',type:'market',quantity:'',price:''});
 const [reduce,setReduce]=useState({});const pending=useRef(false),keys=useRef(new Map()),submission=useRef(null);
 // Item 1 — explicit refresh state machine + concurrent-refresh guard.
 const [refreshState,setRefreshState]=useState('idle');// idle|loading|success|error
 const [refreshInfo,setRefreshInfo]=useState(null);// {kind,message} on error
 const [lastRefreshed,setLastRefreshed]=useState(null);
 const refreshing=useRef(false);
 // Item 3 — catalog-backed searchable selector state. Fillable symbols are the
 // ones the origin actually publishes a fresh paper quote for; learned from the
 // live snapshot, never hardcoded in the browser.
 const [published,setPublished]=useState(new Set());
 const [browseClass,setBrowseClass]=useState(INSTRUMENT_CLASS.PERP);
 const [rawQuery,setRawQuery]=useState('');
 const [query,setQuery]=useState('');
 const [offset,setOffset]=useState(0);
 const debounce=useRef(null);
 const cat=useMemo(()=>catalogState(),[]);

 async function api(route,body,key){
  let r;
  try{r=await fetch('/api/trading/paper/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
  catch(transport){const e=Error('network_unreachable');e.cause=transport;throw e;}// no HTTP response -> network kind
  let b;try{b=await r.json();}catch{const e=Error(r.ok?'malformed_response':'paper_api_unavailable');e.httpStatus=r.status;throw e;}
  if(!r.ok){const e=Error(b.error||'paper_api_unavailable');e.httpStatus=r.status;e.code=b.error;throw e;}
  return b;
 }
 // Read-only refresh: re-pulls status + ledger (+ published quote set). Never
 // mutates state or places an order. Rapid clicks while in-flight are no-ops.
 async function refresh(){
  if(refreshing.current)return;refreshing.current=true;setRefreshState('loading');
  try{
   const s=await api('status');setStatus(s);onNamespace?.(s.namespace);
   let led=null;
   try{led=await api('ledger');}
   catch(e){if(classifyError(e)==='auth')throw e;led=null;}// policy-unset etc. => no ledger, not a hard refresh failure
   setLedger(led);
   try{const snap=await fetch('/api/trading/snapshot',{cache:'no-store'});if(snap.ok){const sd=await snap.json();setPublished(new Set((sd?.perp?.rows||[]).map(r=>r.symbol)));}}catch{/* keep prior published set; snapshot is advisory */}
   setLastRefreshed(Date.now());setRefreshState('success');setRefreshInfo(null);setError('');
  }catch(e){const kind=classifyError(e);setRefreshState('error');setRefreshInfo({kind,message:human(e.message)});}
  finally{refreshing.current=false;}
 }
 useEffect(()=>{refresh();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 // Debounced catalog search.
 useEffect(()=>{if(debounce.current)clearTimeout(debounce.current);debounce.current=setTimeout(()=>{setQuery(rawQuery);setOffset(0);},220);return()=>clearTimeout(debounce.current);},[rawQuery]);
 const search=useMemo(()=>searchCatalog({query,instrumentClass:browseClass,limit:PAGE,offset}),[query,browseClass,offset]);
 const selected=useMemo(()=>resolveInstrument(draft.symbol,draft.instrument_class),[draft.symbol,draft.instrument_class]);
 const fillable=draft.instrument_class===INSTRUMENT_CLASS.PERP&&published.has(draft.symbol);

 async function act(route,body){if(pending.current||!window.confirm('Confirm PAPER '+route+' '+JSON.stringify(body)+'? No real money.'))return;pending.current=true;setBusy(true);setError('');const binding=route+JSON.stringify(body);try{let attempt=keys.current.get(binding);if(!attempt){const reply=await api('approval',{action:route,input:body,confirmation:'CONFIRM PAPER'});attempt={approval:reply.approval,key:crypto.randomUUID()};keys.current.set(binding,attempt);}await api(route,{...body,approval:attempt.approval},attempt.key);await refresh();keys.current.delete(binding);}catch(e){if(/approval|confirmation/.test(e.message))keys.current.delete(binding);setError(human(e.message));}finally{pending.current=false;setBusy(false);}}
 const ticket=()=>({mode:'paper',instrument_class:draft.instrument_class,symbol:draft.symbol,side:draft.side,type:draft.type,quantity:draft.quantity,price:draft.type==='limit'?draft.price:null});
 async function submit(e){e.preventDefault();if(!confirmation||pending.current||!fillable)return;pending.current=true;setBusy(true);setError('');const d=ticket(),binding=JSON.stringify(d);try{if(submission.current?.binding!==binding){const reply=await api('approval',{draft:d,confirmation:'CONFIRM PAPER'});submission.current={binding,approval:reply.approval,key:crypto.randomUUID()};}const attempt=submission.current;await api('submit',{draft:d,approval:attempt.approval},attempt.key);await refresh();submission.current=null;setConfirmation(false);}catch(e){if(/approval|confirmation/.test(e.message)){submission.current=null;setConfirmation(false);}setError(human(e.message));}finally{pending.current=false;setBusy(false);}}
 const edit=(key,value)=>{setDraft(d=>({...d,[key]:value}));setConfirmation(false);};
 const pick=row=>{setDraft(d=>({...d,symbol:row.symbol,instrument_class:row.class}));setConfirmation(false);};
 const switchClass=cls=>{setBrowseClass(cls);setOffset(0);};

 const refreshedCopy=lastRefreshed?`Last refreshed ${new Date(lastRefreshed).toISOString()}`:'Not refreshed yet';
 return <div aria-label="Paper controls">
  <p className="tw-warning"><strong>PAPER ONLY — NO REAL MONEY</strong> · {status?.namespace==='fixture'?'ISOLATED TEST LEDGER':'PAPER SIMULATION'}</p>
  <p>Cancel removes only unfilled quantity. Close or reduce exits a filled paper position. No account or broker is connected. Spot instruments are catalog-listed for reference only — the paper engine fills perpetuals for which a fresh approved quote is published; it does not fill spot.</p>

  {error&&<p role="alert" className="tw-warning">{error}</p>}
  <div className="tw-paper-grid"><form onSubmit={submit}>
   <h3>Initiate paper trade</h3>
   <fieldset className="tw-instrument" data-testid="instrument-selector">
    <legend>Instrument — BloFin catalog</legend>
    <div className="tw-class-toggle" role="group" aria-label="Instrument class">
     {[[INSTRUMENT_CLASS.PERP,`Perpetual (${BLOFIN_CATALOG_COUNTS.perp})`],[INSTRUMENT_CLASS.SPOT,`Spot (${BLOFIN_CATALOG_COUNTS.spot})`]].map(([cls,label])=>
      <button type="button" key={cls} aria-pressed={browseClass===cls} onClick={()=>switchClass(cls)}>{label}</button>)}
    </div>
    <label>Search tickers<input type="search" value={rawQuery} placeholder="e.g. BTC, SOL-USDT, DOGE" onChange={e=>setRawQuery(e.target.value)} aria-label="Search BloFin instruments"/></label>
    <p className="tw-note" data-testid="catalog-provenance">BloFin {browseClass===INSTRUMENT_CLASS.PERP?'perpetual':'spot'} catalog snapshot · captured {BLOFIN_CATALOG_PROVENANCE.captured_at} · {search.total} match{search.total===1?'':'es'}. Static snapshot, not a live feed; verify listings against BloFin. Age {Math.floor((cat.ageSeconds??0)/86400)}d.</p>
    <ul className="tw-catalog-results" data-testid="catalog-results">
     {search.rows.map(row=>{const q=browseClass===INSTRUMENT_CLASS.PERP&&published.has(row.symbol);return(
      <li key={row.symbol}>
       <button type="button" aria-pressed={draft.symbol===row.symbol&&draft.instrument_class===row.class} onClick={()=>pick(row)}>
        <strong>{row.symbol}</strong> <small>{row.name}</small>
        <span className="tw-class-tag">{row.class===INSTRUMENT_CLASS.PERP?'PERP':'SPOT'}</span>
        <span className="tw-fill-tag">{row.class===INSTRUMENT_CLASS.SPOT?'not fillable':q?'paper quote live':'no paper quote'}</span>
       </button>
      </li>);})}
     {!search.rows.length&&<li><em>No BloFin {browseClass===INSTRUMENT_CLASS.PERP?'perpetual':'spot'} instrument matches "{query}". No substitute venue is shown.</em></li>}
    </ul>
    {search.hasMore&&<button type="button" className="tw-more" onClick={()=>setOffset(o=>o+PAGE)}>Show more ({search.total-(offset+PAGE)} remaining)</button>}
    <p className="tw-selected" data-testid="selected-instrument">
     Selected: <strong>{draft.symbol}</strong> · <span className="tw-class-tag">{draft.instrument_class===INSTRUMENT_CLASS.PERP?'PERPETUAL':'SPOT'}</span>
     {selected?'':' · not found in catalog'}
    </p>
    {!fillable&&<p role="alert" className="tw-warning" data-testid="not-fillable">{draft.instrument_class===INSTRUMENT_CLASS.SPOT
      ?'Spot is catalog-listed but the paper engine has no verified spot transport — it cannot be paper-filled. Select a perpetual with a live paper quote.'
      :'No approved paper quote is published for this perpetual. It is catalog-listed only and cannot be paper-filled right now. The server independently re-validates instrument, class, freshness and precision.'}</p>}
   </fieldset>
   <label>Side<select value={draft.side} onChange={e=>edit('side',e.target.value)}><option value="buy">Buy / long</option><option value="sell">Sell / short</option></select></label>
   <label>Order type<select value={draft.type} onChange={e=>edit('type',e.target.value)}><option value="market">Market</option><option value="limit">Limit</option></select></label>
   {[['quantity','Quantity'],...(draft.type==='limit'?[['price','Limit price (USDT)']]:[])].map(([key,label])=><label key={key}>{label}<input required type="number" min="0.00000001" step="any" value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>)}
   <p className="tw-note">No capital, leverage or account balance is assumed. Fills use fresh approved bid/ask quotes, never TradingView prices. Fees and funding are not modelled; P&L is gross simulated price movement.</p>
   <label><input type="checkbox" checked={confirmation} onChange={e=>setConfirmation(e.target.checked)}/> Confirm this specific PAPER ticket</label>
   <button className="tw-primary" disabled={busy||!confirmation||!fillable} type="submit">Confirm & submit paper trade</button>
  </form><div className="tw-admission"><h3>Paper P&amp;L</h3><strong>{ledger?ledger.realized_pnl+' USDT':'Unavailable — ledger not connected'}</strong><p>Gross simulated P&amp;L. Fees and funding are not modelled. No real account balance.</p>
   <div className="tw-refresh" data-testid="refresh-state" data-refresh-state={refreshState}>
    <button type="button" disabled={refreshState==='loading'} onClick={()=>refresh()}>{refreshState==='loading'?'Refreshing…':'Refresh paper ledger'}</button>
    <p role="status" aria-live="polite" className="tw-refresh-status">
     {refreshState==='loading'&&'Refreshing paper status + ledger… (read-only)'}
     {refreshState==='success'&&`Refreshed · ${refreshedCopy}`}
     {refreshState==='error'&&<span className="tw-warning" role="alert">Refresh failed [{refreshInfo?.kind}]: {refreshInfo?.message}. {REFRESH_HINT[refreshInfo?.kind]} {lastRefreshed?`(${refreshedCopy})`:''}</span>}
     {refreshState==='idle'&&refreshedCopy}
    </p>
   </div>
  </div></div>
  <h3>Pending / partially filled orders</h3>
  {!ledger?.orders?.some(o=>['pending','partial'].includes(o.status))&&<p>{ledger?'No unfilled paper orders.':'Paper ledger unavailable; no empty account is inferred.'}</p>}
  {ledger?.orders.filter(o=>['pending','partial'].includes(o.status)).map(o=><article className="tw-admission" key={o.id}><strong>{o.symbol} · {o.side} · {o.status}</strong><p>Filled {o.filled} · Remaining {o.remaining}</p><button disabled={busy} onClick={()=>act('settle',{id:o.id})}>Simulate eligible fill</button> <button disabled={busy} onClick={()=>act('cancel',{id:o.id})}>Cancel remaining quantity</button></article>)}
  <h3>Filled paper positions</h3>
  {!ledger?.positions?.some(p=>p.status==='open')&&<p>{ledger?'No open paper positions.':'Positions unavailable.'}</p>}
  {ledger?.positions.filter(p=>p.status==='open').map(p=><article className="tw-admission" key={p.id}><strong>{p.symbol} · {p.side}</strong><p>Quantity {p.quantity} · Average entry {p.entry_price}</p><label>Reduce quantity<input aria-label={'Reduce quantity '+p.symbol} type="number" min="0.00000001" max={p.quantity} step="any" value={reduce[p.id]??''} onChange={e=>setReduce({...reduce,[p.id]:e.target.value})}/></label><button disabled={busy} onClick={()=>act('reduce',{id:p.id,quantity:reduce[p.id]})}>Reduce position</button> <button disabled={busy} onClick={()=>act('reduce',{id:p.id,quantity:p.quantity})}>Close position</button></article>)}
  <h3>Order / fill / position history</h3>
  {!ledger?.history?.length&&<p>{ledger?'No paper activity yet.':'History unavailable.'}</p>}
  <div className="tw-table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Instrument</th><th>Simulated price</th><th>Fee / funding</th><th>Source / observed</th></tr></thead><tbody>{ledger?.history.slice().reverse().map(h=><tr key={h.id}><td>{new Date(h.at).toISOString()}</td><td>{h.action}</td><td>{h.order?.symbol||h.position?.symbol}</td><td>{h.fill?.price??'—'}</td><td>{h.fill?`${h.fill.fee??'not modelled'} / ${h.fill.funding??'not modelled'}`:'—'}</td><td>{h.fill?`${h.fill.quote.source} / ${new Date(h.fill.quote.observed_at_ms).toISOString()}`:'—'}</td></tr>)}</tbody></table></div>

 </div>;
}
