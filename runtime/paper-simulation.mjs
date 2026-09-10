// V2 paper-only engine. Legacy records are retained, not silently re-priced.
import {PaperLedger,PaperError,fingerprint} from './paper-ledger.mjs';
import {parse,format,mul,div,roundDiv} from './paper-decimal.mjs';
import {PAPER_CAPABILITY} from './paper-capability.mjs';
import {randomUUID} from 'node:crypto';
const fail=(s,status=422)=>{throw new PaperError(s,status);};
const dec=x=>{try{return parse(x);}catch{fail('invalid_decimal');}};
const positive=x=>{const n=dec(x);if(n<=0n||n>10n**24n)fail('invalid_values');return n;};
const qty=x=>{const n=positive(x);if(n%10000n)fail('quantity_precision');return n;};
const exactKeys=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))fail('unsupported_fields');};
export class PaperSimulation extends PaperLedger{
 constructor(options){super({...options,policy:null});this.capability=Object.freeze({...PAPER_CAPABILITY,kind:this.namespace});this.migrate();}
 migrate(){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const s=this.read();if(s.accounting==='decimal-12-v2'){this.db.exec('COMMIT');return;}
   this.db.exec('CREATE TABLE IF NOT EXISTS ledger_v1_archive (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
   this.db.prepare('INSERT OR IGNORE INTO ledger_v1_archive VALUES (1,?)').run(JSON.stringify(s));
   const legacy=x=>{try{return format(parse(x));}catch{if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e12)fail('legacy_decimal_migration_unrepresentable');return format(parse(x.toFixed(12)));}};
   for(const o of s.orders){for(const k of ['quantity','filled','remaining','executed_notional'])if(o[k]!=null)o[k]=legacy(o[k]);if(o.price!=null)o.price=legacy(o.price);o.accounting='decimal-12-v2';o.legacy_simulation_assumptions=o.policy??null;}
   for(const p of s.positions){for(const k of ['quantity','entry_price','realized_pnl'])p[k]=legacy(p[k]);p.cost_basis=format(mul(dec(p.quantity),dec(p.entry_price)));p.accounting='decimal-12-v2';p.legacy_simulation_assumptions=p.policy??null;}
   s.accounting='decimal-12-v2';s.migration={from:'legacy-binary-number',original:'ledger_v1_archive',rounding:'legacy numeric values rounded to 12 decimal places only when not exactly representable; history and idempotency receipts unchanged'};
   this.db.prepare('UPDATE ledger SET data=? WHERE id=1').run(JSON.stringify(s));this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');this.db.close();throw e;}
 }
 view(identity){const v=super.view(identity);return {...v,policy:null,capability:this.capability,realized_pnl:format(v.positions.reduce((a,p)=>a+dec(p.realized_pnl),0n)),accounting:'decimal-12-v2'};}
 transaction(identity,key,action,input,state){
  const owner=this.principal(identity);
  if(typeof key!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(key))fail('idempotency_key_required');
  if(!['submit','fill','settle','cancel','reduce'].includes(action))fail('unsupported_or_live_route_disabled',404);
  // Partial fills are an internal legacy/testing action, never an HTTP route.
  exactKeys(input,action==='submit'?['draft','approval']:['cancel','settle'].includes(action)?['id','approval']:['id','quantity','approval']);
  const {approval,...payload}=input,hash=fingerprint({action,input}),reqKey=fingerprint({owner,key});
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const s=this.read(),prior=s.requests[reqKey];
   if(prior){if(prior.hash!==hash)fail('idempotency_conflict',409);this.db.exec('COMMIT');return {...prior.result,duplicate:true};}
   if(this.namespace==='operational'&&state?.fixture===true)fail('fixture_market_data_forbidden');
   const binding=fingerprint({action,input:action==='submit'?input.draft:payload});
   if(typeof approval!=='string'||!this.verifyApproval({approval,owner,binding,namespace:this.namespace}))fail('per_trade_approval_required',403);
   const approvalKey=fingerprint({approval});if(s.approvals[approvalKey])fail('approval_already_used',409);
   const now=this.now();
   const quote=symbol=>{
    const f=state?.perp,r=f?.rows?.find(r=>r.symbol===symbol),stamp=Date.parse(f?.generated_at);
    if(f?.source!=='blofin_public'||f.instrument_class!=='crypto_perp'||f.state!=='fresh'||!r||r.state!=='fresh'||!Number.isFinite(f.ttl_seconds)||f.ttl_seconds<=0)fail('approved_perp_data_unavailable');
    if(!Number.isFinite(stamp)||now<stamp||now-stamp>f.ttl_seconds*1000||!Number.isFinite(r.observed_at_ms)||now<r.observed_at_ms||now-r.observed_at_ms>f.ttl_seconds*1000)fail('market_data_stale');
    const bid=positive(r.exact?.bid??r.bid),ask=positive(r.exact?.ask??r.ask);positive(r.exact?.mark??r.mark);dec(r.exact?.funding_rate??r.funding_rate);if(bid>ask)fail('invalid_quote');
    return {...r,source:f.source,source_sha256:f.source_sha256??null,bid:format(bid),ask:format(ask)};
   };
   let result;
   if(action==='submit'){
    const d=input.draft;exactKeys(d,['mode','instrument_class','symbol','side','type','quantity','price']);
    if(d.mode!=='paper'||d.instrument_class!=='crypto_perp'||!['BTC-USDT','ETH-USDT','SOL-USDT','BNB-USDT','XRP-USDT'].includes(d.symbol)||!['buy','sell'].includes(d.side)||!['market','limit'].includes(d.type))fail('invalid_paper_draft');
    const quantity=qty(d.quantity);if(d.type==='limit')positive(d.price);else if(d.price!=null)fail('invalid_values');quote(d.symbol);
    const order={id:randomUUID(),owner,...d,quantity:format(quantity),price:d.type==='limit'?format(dec(d.price)):null,filled:'0',remaining:format(quantity),status:'pending',created_at:now,accounting:'decimal-12-v2'};s.orders.push(order);result={order};
   }else if(action==='cancel'){
    const o=s.orders.find(o=>o.id===input.id&&o.owner===owner);if(!o)fail('order_not_found',404);
    if(!['pending','partial'].includes(o.status)||dec(o.remaining)<=0n)fail('filled_or_cancelled_order_cannot_cancel',409);
    const cancelled_quantity=o.remaining;o.remaining='0';o.status='cancelled';result={order:o,cancelled_quantity};
   }else if(action==='fill'||action==='settle'){
    const o=s.orders.find(o=>o.id===input.id&&o.owner===owner);if(!o)fail('order_not_found',404);
    if(!['pending','partial'].includes(o.status))fail('order_not_fillable',409);
    if(o.accounting!=='decimal-12-v2')fail('legacy_order_requires_cancel_and_reconfirmation',409);
    const n=action==='settle'?qty(o.remaining):qty(input.quantity);if(n>dec(o.remaining))fail('invalid_fill_quantity');
    const q=quote(o.symbol),price=dec(o.side==='buy'?q.ask:q.bid);
    if(o.type==='limit'&&(o.side==='buy'?price>dec(o.price):price<dec(o.price)))fail('limit_not_marketable',409);
    const cost=mul(price,n);let p=s.positions.find(p=>p.order_id===o.id);
    if(!p){p={id:randomUUID(),order_id:o.id,owner,symbol:o.symbol,side:o.side,quantity:'0',cost_basis:'0',entry_price:'0',realized_pnl:'0',status:'open',opened_at:now,accounting:'decimal-12-v2'};s.positions.push(p);}
    p.quantity=format(dec(p.quantity)+n);p.cost_basis=format(dec(p.cost_basis)+cost);p.entry_price=format(div(dec(p.cost_basis),dec(p.quantity)));p.status='open';
    o.filled=format(dec(o.filled)+n);o.remaining=format(dec(o.quantity)-dec(o.filled));o.executed_notional=format(dec(o.executed_notional??'0')+cost);o.status=dec(o.remaining)===0n?'filled':'partial';
    result={order:o,position:p,fill:{quantity:format(n),price:format(price),fee:null,funding:null,quote:q,assumptions:this.capability}};
   }else{
    const p=s.positions.find(p=>p.id===input.id&&p.owner===owner);if(!p)fail('position_not_found',404);
    const n=qty(input.quantity),total=qty(p.quantity);if(n>total||p.status!=='open')fail('invalid_reduce_quantity',409);
    if(p.accounting!=='decimal-12-v2')fail('legacy_position_migration_required',409);
    const q=quote(p.symbol),price=dec(p.side==='buy'?q.bid:q.ask),basis=dec(p.cost_basis),allocated=n===total?basis:roundDiv(basis*n,total);
    const pnl=(mul(price,n)-allocated)*(p.side==='buy'?1n:-1n);
    p.cost_basis=format(basis-allocated);p.quantity=format(total-n);p.realized_pnl=format(dec(p.realized_pnl)+pnl);p.status=n===total?'closed':'open';
    result={position:p,fill:{quantity:format(n),price:format(price),fee:null,funding:null,realized_pnl:format(pnl),quote:q,assumptions:this.capability}};
   }
   s.approvals[approvalKey]=true;
   const output={ok:true,mode:'paper',live_mode:false,namespace:this.namespace,duplicate:false,...result};
   s.history.push({id:randomUUID(),owner,action,at:now,...structuredClone(result)});s.requests[reqKey]={hash,result:structuredClone(output)};
   this.db.prepare('UPDATE ledger SET data=? WHERE id=1').run(JSON.stringify(s));this.db.exec('COMMIT');return output;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
