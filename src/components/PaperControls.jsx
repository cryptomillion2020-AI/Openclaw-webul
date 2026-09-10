import { useEffect, useRef, useState } from 'react';
const symbols=['BTC-USDT','ETH-USDT','SOL-USDT','BNB-USDT','XRP-USDT'];

const human=s=>String(s).replaceAll('_',' ');
export function PaperControls({onNamespace}){
 const [status,setStatus]=useState(null),[ledger,setLedger]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmation,setConfirmation]=useState(false);
 const [draft,setDraft]=useState({symbol:'BTC-USDT',side:'buy',type:'market',quantity:'',price:''});
 const [reduce,setReduce]=useState({});const pending=useRef(false),keys=useRef(new Map()),submission=useRef(null);
 async function api(route,body,key){const r=await fetch('/api/trading/paper/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw Error(b.error||'paper_api_unavailable');return b;}
 async function refresh(){const s=await api('status');setStatus(s);onNamespace?.(s.namespace);try{setLedger(await api('ledger'));}catch{setLedger(null);}}
 useEffect(()=>{refresh().catch(e=>setError(human(e.message)));},[]);
 async function act(route,body){if(pending.current||!window.confirm('Confirm PAPER '+route+' '+JSON.stringify(body)+'? No real money.'))return;pending.current=true;setBusy(true);setError('');const binding=route+JSON.stringify(body);try{let attempt=keys.current.get(binding);if(!attempt){const reply=await api('approval',{action:route,input:body,confirmation:'CONFIRM PAPER'});attempt={approval:reply.approval,key:crypto.randomUUID()};keys.current.set(binding,attempt);}await api(route,{...body,approval:attempt.approval},attempt.key);await refresh();keys.current.delete(binding);}catch(e){if(/approval|confirmation/.test(e.message))keys.current.delete(binding);setError(human(e.message));}finally{pending.current=false;setBusy(false);}}
 const ticket=()=>({mode:'paper',instrument_class:'crypto_perp',symbol:draft.symbol,side:draft.side,type:draft.type,quantity:draft.quantity,price:draft.type==='limit'?draft.price:null});
 async function submit(e){e.preventDefault();if(!confirmation||pending.current)return;pending.current=true;setBusy(true);setError('');const d=ticket(),binding=JSON.stringify(d);try{if(submission.current?.binding!==binding){const reply=await api('approval',{draft:d,confirmation:'CONFIRM PAPER'});submission.current={binding,approval:reply.approval,key:crypto.randomUUID()};}const attempt=submission.current;await api('submit',{draft:d,approval:attempt.approval},attempt.key);await refresh();submission.current=null;setConfirmation(false);}catch(e){if(/approval|confirmation/.test(e.message)){submission.current=null;setConfirmation(false);}setError(human(e.message));}finally{pending.current=false;setBusy(false);}}
 const edit=(key,value)=>{setDraft(d=>({...d,[key]:value}));setConfirmation(false);};
 return <div aria-label="Paper controls">
  <p className="tw-warning"><strong>PAPER ONLY — NO REAL MONEY</strong> · {status?.namespace==='fixture'?'ISOLATED TEST LEDGER':'PAPER SIMULATION'}</p>
  <p>Cancel removes only unfilled quantity. Close or reduce exits a filled paper position. Spot is unavailable. No account or broker is connected.</p>

  {error&&<p role="alert" className="tw-warning">{error}</p>}
  <div className="tw-paper-grid"><form onSubmit={submit}>
   <h3>Initiate paper trade</h3>
   <label>Perpetual symbol<select value={draft.symbol} onChange={e=>edit('symbol',e.target.value)}>{symbols.map(s=><option key={s}>{s}</option>)}</select></label>
   <label>Side<select value={draft.side} onChange={e=>edit('side',e.target.value)}><option value="buy">Buy / long</option><option value="sell">Sell / short</option></select></label>
   <label>Order type<select value={draft.type} onChange={e=>edit('type',e.target.value)}><option value="market">Market</option><option value="limit">Limit</option></select></label>
   {[['quantity','Quantity'],...(draft.type==='limit'?[['price','Limit price (USDT)']]:[])].map(([key,label])=><label key={key}>{label}<input required type="number" min="0.00000001" step="any" value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>)}
   <p className="tw-note">No capital, leverage or account balance is assumed. Fills use fresh approved bid/ask quotes, never TradingView prices. Fees and funding are not modelled; P&L is gross simulated price movement.</p>
   <label><input type="checkbox" checked={confirmation} onChange={e=>setConfirmation(e.target.checked)}/> Confirm this specific PAPER ticket</label>
   <button className="tw-primary" disabled={busy||!confirmation} type="submit">Confirm & submit paper trade</button>
  </form><div className="tw-admission"><h3>Paper P&amp;L</h3><strong>{ledger?ledger.realized_pnl+' USDT':'Unavailable — ledger not connected'}</strong><p>Gross simulated P&amp;L. Fees and funding are not modelled. No real account balance.</p><button type="button" disabled={busy} onClick={()=>refresh().catch(e=>setError(human(e.message)))}>Refresh paper ledger</button></div></div>
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
