// Simulation only. No broker, account, credential, network or real-order dependency.
// SQLite BEGIN IMMEDIATE serializes transitions across connections/processes.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { SYMBOLS } from './trading-api.mjs';

export class PaperError extends Error { constructor(code, status=422) { super(code); this.status=status; } }
const fail = (code,status) => { throw new PaperError(code,status); };
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1e12;
// Quantity precision is a representation limit, not an operational risk default.
const units = n => Math.round(n*1e8);
const quantity = n => positive(n) && Number.isSafeInteger(units(n)) && units(n)/1e8===n;
const addQty = (a,b) => (units(a)+units(b))/1e8;
const subQty = (a,b) => (units(a)-units(b))/1e8;
const canonical = x => x===null || typeof x!=='object' ? JSON.stringify(x) : Array.isArray(x) ? '['+x.map(canonical).join(',')+']' : '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
export const fingerprint = x => createHash('sha256').update(canonical(x)).digest('hex');
const fields = ['mode','instrument_class','symbol','side','type','quantity','price','leverage','risk_amount','policy_version'];
export function validatePolicy(p) {
  if (!p || !['operational','fixture'].includes(p.kind) || typeof p.version !== 'string' || !p.version.length) fail('risk_policy_unset');
  for (const key of ['max_leverage','risk_per_trade','max_funding_cost_fraction','holding_horizon_intervals','max_notional']) if (!positive(p[key])) fail('invalid_policy_'+key);
  if (!Number.isInteger(p.holding_horizon_intervals) || p.max_funding_cost_fraction > 1) fail('invalid_policy');
  for (const key of ['fee_fraction','slippage_fraction']) if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key]<0 || p[key]>=1) fail('simulation_assumptions_unset');
  return p;
}
export function validateDraft(d,p) {
  validatePolicy(p);
  if (!d || Object.keys(d).some(k=>!fields.includes(k)) || d.mode!=='paper' || d.instrument_class!=='crypto_perp' || !SYMBOLS.includes(d.symbol) || !['buy','sell'].includes(d.side) || !['market','limit'].includes(d.type)) fail('invalid_paper_draft');
  if (!quantity(d.quantity) || !positive(d.leverage) || !positive(d.risk_amount) || (d.type==='limit' && !positive(d.price)) || (d.type==='market' && d.price!=null)) fail('invalid_values');
  if (d.leverage>p.max_leverage || d.risk_amount>p.risk_per_trade) fail('policy_limit_exceeded');
  if (d.policy_version!==p.version) fail('policy_version_changed',409);
}
function quote(state,symbol,p,now) {
  const feed=state?.perp, r=feed?.rows?.find(r=>r.symbol===symbol);
  if (feed?.source!=='blofin_public' || feed.instrument_class!=='crypto_perp' || feed.state!=='fresh' || !positive(feed.ttl_seconds) || !r || r.state!=='fresh' || !positive(r.mark) || !positive(r.bid) || !positive(r.ask) || r.bid>r.ask || !Number.isFinite(r.funding_rate)) fail('approved_perp_data_unavailable');
  const stamp=Date.parse(feed.generated_at);
  if (!Number.isFinite(stamp) || now<stamp || now-stamp>feed.ttl_seconds*1000 || !Number.isFinite(r.observed_at_ms) || now<r.observed_at_ms || now-r.observed_at_ms>feed.ttl_seconds*1000) fail('market_data_stale');
  if (Math.abs(r.funding_rate)*p.holding_horizon_intervals>p.max_funding_cost_fraction) fail('funding_ceiling_exceeded');
  return {...r,source:feed.source,source_sha256:feed.source_sha256??null};
}
export class PaperLedger {
  constructor({filename, namespace='operational', policy=null, verifyApproval=()=>false, now=Date.now}) {
    if (!filename || !['operational','fixture'].includes(namespace)) fail('explicit_ledger_path_required');
    // Fixture stores are explicitly named and can never be opened as an operational ledger.
    if (namespace==='fixture' && !path.basename(filename).startsWith('fixture-')) fail('fixture_path_required');
    if (policy && policy.kind!==namespace) fail('fixture_policy_isolation');
    if (policy) validatePolicy(policy);
    this.policy=policy?structuredClone(policy):null;this.namespace=namespace;this.verifyApproval=verifyApproval;this.now=now;
    this.db=new DatabaseSync(filename);this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);');
    this.db.prepare('INSERT OR IGNORE INTO ledger VALUES (1,?)').run(JSON.stringify({namespace,orders:[],positions:[],history:[],requests:{},approvals:{}}));
    if(this.read().namespace!==namespace){this.db.close();fail('ledger_namespace_mismatch');}
  }
  read(){return JSON.parse(this.db.prepare('SELECT data FROM ledger WHERE id=1').get().data);}
  principal(identity){if(!identity || identity.authenticated!==true || typeof identity.subject!=='string' || !identity.subject.length)fail('authentication_required',401);return identity.subject;}
  view(identity){const owner=this.principal(identity),s=this.read();return {mode:'paper',live_mode:false,namespace:this.namespace,policy:this.policy,orders:s.orders.filter(x=>x.owner===owner),positions:s.positions.filter(x=>x.owner===owner),history:s.history.filter(x=>x.owner===owner),realized_pnl:s.positions.filter(x=>x.owner===owner).reduce((a,p)=>a+p.realized_pnl,0)};}
  transaction(identity,key,action,input,state){
    const owner=this.principal(identity);
    if(typeof key!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(key))fail('idempotency_key_required');
    if(!['submit','fill','settle','cancel','reduce'].includes(action))fail('unsupported_or_live_route_disabled',404);
    const hash=fingerprint({action,input}),reqKey=fingerprint({owner,key});
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const s=this.read(), prior=s.requests[reqKey];
      if(prior){if(prior.hash!==hash)fail('idempotency_conflict',409);this.db.exec('COMMIT');return {...prior.result,duplicate:true};}
      const now=this.now();let result;
      if(this.namespace==='operational' && state?.fixture===true)fail('fixture_market_data_forbidden');
      const allowed=action==='submit'?['draft','approval']:['cancel','settle'].includes(action)?['id']:['id','quantity'];
      if(!input || typeof input!=='object' || Object.keys(input).some(k=>!allowed.includes(k)))fail('unsupported_fields');
      if(action==='submit'){
        const {draft,approval}=input;validateDraft(draft,this.policy);
        const q=quote(state,draft.symbol,this.policy,now);
        const notional=draft.quantity*Math.max(q.ask,draft.price||0)*(1+this.policy.slippage_fraction);
        if(notional>this.policy.max_notional)fail('oversize_notional');
        // No stop-loss model is assumed: conservatively reserve the full notional as risk.
        if(notional>draft.risk_amount)fail('risk_reserve_insufficient');
        // Approval adapter is server-side; neither Access alone nor a client boolean grants approval.
        const binding=fingerprint(draft);
        if(typeof approval!=='string'||!approval.length||this.verifyApproval({approval,owner,binding,policy_version:this.policy.version,now})!==true)fail('per_trade_approval_required',403);
        const approvalKey=fingerprint({approval});if(s.approvals[approvalKey])fail('approval_already_used',409);
        s.approvals[approvalKey]=true;
        const order={id:randomUUID(),owner,...draft,filled:0,remaining:draft.quantity,status:'pending',created_at:now,policy:structuredClone(this.policy)};
        s.orders.push(order);result={order};
      }else if(action==='fill'||action==='settle'){
        const o=s.orders.find(x=>x.id===input.id&&x.owner===owner);if(!o)fail('order_not_found',404);
        if(!['pending','partial'].includes(o.status))fail('order_not_fillable',409);
        const fillQuantity=action==='settle'?o.remaining:input.quantity;
        if(!quantity(fillQuantity)||fillQuantity>o.remaining)fail('invalid_fill_quantity');
        const q=quote(state,o.symbol,o.policy,now),p=o.policy;
        const price=(o.side==='buy'?q.ask:q.bid)*(1+(o.side==='buy'?1:-1)*p.slippage_fraction);
        if(o.type==='limit'&&(o.side==='buy'?price>o.price:price<o.price))fail('limit_not_marketable',409);
        const qty=fillQuantity,fee=price*qty*p.fee_fraction;
        const used=(o.executed_notional||0)+price*qty;
        if(!Number.isFinite(used)||used>Math.min(o.risk_amount,p.max_notional))fail('fill_risk_limit_exceeded');
        o.executed_notional=used;
        let pos=s.positions.find(x=>x.order_id===o.id);
        if(!pos){pos={id:randomUUID(),order_id:o.id,owner,symbol:o.symbol,side:o.side,quantity:0,entry_price:0,realized_pnl:0,status:'open',policy:p,opened_at:now};s.positions.push(pos);}
        pos.entry_price=(pos.entry_price*pos.quantity+price*qty)/addQty(pos.quantity,qty);pos.quantity=addQty(pos.quantity,qty);pos.status='open';pos.realized_pnl-=fee;
        o.filled=addQty(o.filled,qty);o.remaining=subQty(o.quantity,o.filled);o.status=o.remaining===0?'filled':'partial';
        result={order:o,position:pos,fill:{quantity:qty,price,fee,funding:0,assumptions:{fee_fraction:p.fee_fraction,slippage_fraction:p.slippage_fraction,funding:'conservative absolute funding reserve applied on close over policy horizon'},quote:q}};
      }else if(action==='cancel'){
        const o=s.orders.find(x=>x.id===input.id&&x.owner===owner);if(!o)fail('order_not_found',404);
        if(!['pending','partial'].includes(o.status)||o.remaining<=0)fail('filled_or_cancelled_order_cannot_cancel',409);
        const cancelled_quantity=o.remaining;o.remaining=0;o.status='cancelled';result={order:o,cancelled_quantity};
      }else{
        const pos=s.positions.find(x=>x.id===input.id&&x.owner===owner);if(!pos)fail('position_not_found',404);
        if(!quantity(input.quantity)||input.quantity>pos.quantity||pos.status!=='open')fail('invalid_reduce_quantity',409);
        const q=quote(state,pos.symbol,pos.policy,now),p=pos.policy,qty=input.quantity;
        const price=(pos.side==='buy'?q.bid:q.ask)*(1+(pos.side==='buy'?-1:1)*p.slippage_fraction);
        const fee=price*qty*p.fee_fraction,funding=pos.entry_price*qty*Math.abs(q.funding_rate)*p.holding_horizon_intervals;
        const pnl=(price-pos.entry_price)*qty*(pos.side==='buy'?1:-1)-fee-funding;
        pos.quantity=subQty(pos.quantity,qty);pos.realized_pnl+=pnl;pos.status=pos.quantity===0?'closed':'open';
        result={position:pos,fill:{quantity:qty,price,fee,funding,realized_pnl:pnl,quote:q,assumptions:{fee_fraction:p.fee_fraction,slippage_fraction:p.slippage_fraction,funding:'absolute rate × policy holding horizon; simulated cost, not account funding'}}};
      }
      const output={ok:true,mode:'paper',live_mode:false,namespace:this.namespace,duplicate:false,...result};
      s.history.push({id:randomUUID(),owner,action,at:now,...structuredClone(result)});s.requests[reqKey]={hash,result:structuredClone(output)};
      this.db.prepare('UPDATE ledger SET data=? WHERE id=1').run(JSON.stringify(s));this.db.exec('COMMIT');return output;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  close(){this.db.close();}
}
