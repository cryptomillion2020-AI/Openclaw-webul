// Consumer for the existing ArchitectApprovalResponse contract.
// Contract hashes prove content, not authority. A separately authenticated decision adapter
// AND an explicitly pinned approver are required. Neither has an operational default.
import {createHash,randomUUID} from 'node:crypto';
import {fingerprint,PaperError,validateDraft} from './paper-ledger.mjs';
export function responseHash(response){
  const {audit_hash,...body}=response;
  const text=JSON.stringify(body,Object.keys(body).sort()).replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  return createHash('sha256').update(text).digest('hex');
}
export function createPaperApprovalConsumer({policy=null,allowedApprovers=[],readVerifiedDecision=null,now=Date.now,ttlMs=60000}={}){
  const pins=new Set(allowedApprovers),receipts=new Map();
  function prune(){for(const [id,r] of receipts)if(r.expires<=now())receipts.delete(id);}
  return {
    async requestApproval({principal,draft,confirmation}){
      if(!principal?.authenticated||!principal.subject)throw new PaperError('authentication_required',401);
      validateDraft(draft,policy);
      if(confirmation!=='CONFIRM PAPER')throw new PaperError('explicit_trade_confirmation_required',403);
      if(!pins.size||typeof readVerifiedDecision!=='function')throw new PaperError('existing_approval_gate_unavailable',409);
      prune();if(receipts.size>=1000)throw new PaperError('approval_capacity_reached',429);
      const binding=fingerprint(draft),created=now(),request_id='APPROVAL-REQ-'+randomUUID();
      const request=Object.freeze({request_id,intent_id:binding,owner:principal.subject,policy_version:policy.version,created_at:new Date(created).toISOString(),expires_at:new Date(created+ttlMs).toISOString()});
      // This callback is server-owned. HTTP clients cannot supply its return value.
      const verified=await readVerifiedDecision(request);
      if(!verified?.principal?.authenticated||!pins.has(verified.principal.subject))throw new PaperError('approval_authority_unverified',403);
      const r=verified.response,keys=['request_id','intent_id','disposition','reason','decided_at','audit_hash'];
      if(!r||Object.keys(r).length!==keys.length||keys.some(k=>typeof r[k]!=='string')||Object.keys(r).some(k=>!keys.includes(k)))throw new PaperError('invalid_approval_contract',403);
      if(r.request_id!==request_id||r.intent_id!==binding||r.disposition!=='APPROVED'||r.audit_hash!==responseHash(r))throw new PaperError('approval_binding_or_decision_invalid',403);
      const decided=Date.parse(r.decided_at);
      if(!Number.isFinite(decided)||decided<created||decided>now()||now()>=created+ttlMs)throw new PaperError('approval_expired_or_future',403);
      const id='paper-approval-'+randomUUID();
      receipts.set(id,{owner:principal.subject,binding,policy_version:policy.version,expires:created+ttlMs});return id;
    },
    verifyApproval({approval,owner,binding,policy_version,now:at}){
      prune();const r=receipts.get(approval);
      return !!r&&r.owner===owner&&r.binding===binding&&r.policy_version===policy_version&&at<r.expires;
    },
  };
}
