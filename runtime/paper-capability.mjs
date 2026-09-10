// Server-owned authorization for paper simulation, never a live-mode/global flag.
import {randomUUID} from 'node:crypto';
import {fingerprint,PaperError} from './paper-ledger.mjs';
export const PAPER_CAPABILITY=Object.freeze({kind:'operational',mode:'paper',version:'paper-confirmed-v2',enabled:true,capital_model:'unfunded simulation; no balance or leverage model',fees:'not modelled',funding:'not modelled; funding schedule unavailable',slippage:'none; execution at fresh public bid/ask'});
export function createPaperActionApprovals({namespace='operational',now=Date.now,ttlMs=60000}={}){
 const receipts=new Map();
 return {
  async requestApproval({principal,action='submit',draft,input,confirmation}){
   if(!principal?.authenticated||!principal.subject)throw new PaperError('authentication_required',401);
   if(!['submit','settle','cancel','reduce'].includes(action))throw new PaperError('unsupported_or_live_route_disabled',404);
   if(confirmation!=='CONFIRM PAPER')throw new PaperError('explicit_trade_confirmation_required',403);
   for(const [id,r] of receipts)if(r.expires<=now())receipts.delete(id);
   if(receipts.size>=1000)throw new PaperError('approval_capacity_reached',429);
   const id='paper-confirmation-'+randomUUID();
   receipts.set(id,{owner:principal.subject,binding:fingerprint({action,input:action==='submit'?draft:input}),namespace,expires:now()+ttlMs});
   return id;
  },
  verifyApproval({approval,owner,binding,namespace:ns}){const r=receipts.get(approval);return !!r&&r.owner===owner&&r.binding===binding&&r.namespace===ns&&now()<r.expires;}
 };
}
