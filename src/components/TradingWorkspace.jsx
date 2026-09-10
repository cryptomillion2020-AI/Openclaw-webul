import { useEffect, useState } from 'react';
import './trading-workspace.css';
import { PaperControls } from './PaperControls';

const number = value => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 8 });
const human = reason => reason.replaceAll('_', ' ');

export function TradingWorkspace({ connected, onReconnect }) {
  const [tab, setTab] = useState('markets');
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading');
  const [now, setNow] = useState(Date.now());
  const [refresh, setRefresh] = useState(0);
  const [instrument, setInstrument] = useState('perp');
  useEffect(() => {
    let cancelled=false;let active=null;
    const load = async () => {
      active?.abort();active=new AbortController();
      const timeout=setTimeout(()=>active?.abort(),8000);
      try {
        const response=await fetch('/api/trading/snapshot',{signal:active.signal,cache:'no-store'});
        if(!response.ok)throw new Error('unavailable');
        const data=await response.json();
        if(data.schema_version!=='trading-webui-1'||data.live_mode!==false||!data.perp||!data.policy)throw new Error('invalid_snapshot');
        if(!cancelled){setSnapshot(data);setStatus('ready');}
      } catch {if(!cancelled)setStatus('error');}finally{clearTimeout(timeout);}
    };
    setStatus(previous=>previous==='ready'?'refreshing':'loading');load();
    const timer=setInterval(load,15000);
    return()=>{cancelled=true;clearInterval(timer);active?.abort();};
  },[refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const data=snapshot?.[instrument];
  const age=data?.generated_at?Math.floor((now-Date.parse(data.generated_at))/1000):null;
  const feedState=status==='error'?'disconnected':!data?'loading':data.state==='fresh'&&(!Number.isFinite(age)||age<0||age>data.ttl_seconds)?'stale':data.state;
  return <section className="trading-workspace wsroom-station--wide" aria-label="Paper trading workspace">
    <header className="tw-header">
      <div><span className="tw-kicker">PUBLIC DATA / PRIVATE DECISIONS</span><h2>Trading desk</h2><p>No capital connected. Paper admission stays closed until policy and authorization exist.</p></div>
      <div className="tw-connection" role="status"><span>Market API: {status==='error'?'disconnected':status==='loading'?'loading':status==='refreshing'?'refreshing':'connected'}</span><span>Fleet socket: {connected?'connected':'disconnected · reconnecting'}</span><button type="button" onClick={()=>{setRefresh(n=>n+1);onReconnect?.();}}>Reconnect / refresh</button></div>
    </header>
    <nav className="tw-tabs" aria-label="Trading desk views">{[['markets','Public markets'],['paper','Paper workspace'],['integrations','Connections & policy']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {snapshot?.fixture === true && <p className="tw-warning" role="status">FIXTURE — ISOLATED TEST DATA, NOT LIVE</p>}
    {status==='loading'&&<p role="status">Loading local public-market snapshot… No values inferred.</p>}
    {status==='error'&&<p className="tw-warning" role="alert">Market API disconnected. Last response is historical only; paper admission remains closed. Use Reconnect / refresh to retry.</p>}
    {tab==='markets'&&<div>
      <div className="tw-toolbar"><label>Market <select aria-label="Market type" value={instrument} onChange={e=>setInstrument(e.target.value)}><option value="perp">BloFin perpetuals</option><option value="spot">BloFin spot — unavailable</option></select></label><span className="tw-state" data-state={feedState}>{feedState.toUpperCase()}{age!=null?` · ${Math.max(0,age)}s old · TTL ${data.ttl_seconds ?? 'unknown'}s`:''}</span></div>
      {data?.reason&&<p className="tw-note">{human(data.reason)}</p>}
      {data?.rows?.length?<div className="tw-table-wrap"><table><caption>BloFin public publisher · {feedState==='fresh'?'source-verified market data':'historical / unverified values — not actionable'}</caption><thead><tr><th>Instrument</th><th>Last</th><th>Bid / Ask</th><th>Mark</th><th>Funding</th><th>Freshness</th></tr></thead><tbody>{data.rows.map(row=>{
        const stale=feedState!=='fresh'||row.state!=='fresh'||!row.observed_at_ms||now-row.observed_at_ms>data.ttl_seconds*1000||now<row.observed_at_ms;
        return <tr key={row.symbol} data-stale={stale}><th scope="row">{row.symbol}<small>PERPETUAL · USDT</small></th><td>{number(row.last)}</td><td>{number(row.bid)} / {number(row.ask)}</td><td>{number(row.mark)}</td><td>{row.funding_rate==null?'UNAVAILABLE':`${(row.funding_rate*100).toFixed(6)}%`}</td><td>{stale?'STALE / HELD':'FRESH'}</td></tr>;
      })}</tbody></table></div>:status!=='loading'&&<div className="tw-empty"><strong>{instrument==='spot'?'Spot unavailable':'No perpetual data'}</strong><p>{instrument==='spot'?'No verified spot interface is connected. We do not relabel swaps as spot or substitute another venue.':'The publisher supplied no supported quote rows. No mock prices, balances or fills are substituted.'}</p></div>}
      <p className="tw-note">Source: {data?.source||'not connected'} · published {data?.generated_at||'unavailable'}. Public quotes are independent of the fleet socket and TradingView. The publisher refreshes separately; this button re-reads, not re-prices.</p>
    </div>}
    {tab==='paper'&&<PaperControls/>}
    {tab==='integrations'&&<div className="tw-policy"><h3>Connections & policy</h3><dl>{Object.entries(snapshot?.policy||{max_leverage:null,max_funding_cost_fraction:null,holding_horizon_intervals:null,risk_per_trade:null,architect_authorized:false}).map(([key,value])=><div key={key}><dt>{human(key)}</dt><dd>{value===null?'UNSET':value===false?'NOT AUTHORIZED':String(value)}</dd></div>)}</dl><p>BloFin perpetuals: public publisher only. Spot: unavailable. Account / broker / execution: not connected. TradingView: display-only; never an automation input.</p><p>{snapshot?.journal?.reason||'Journal interface unavailable. No policy or authorization is assumed.'}</p></div>}
  </section>;
}
