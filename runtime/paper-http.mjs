// Narrow paper-only HTTP surface. No default authenticated owner or approval authority.
import { PaperError, validatePolicy, fingerprint } from './paper-ledger.mjs';
export function createPaperHandler({ledger=null, identity=async()=>null, requestApproval=async()=>null}={}) {
  return async function handle(req,url,getSnapshot){
    if(!url.pathname.startsWith('/api/trading/paper/'))return null;
    const route=url.pathname.slice('/api/trading/paper/'.length);
    if(url.search)return {status:400,body:{error:'query_not_supported'}};
    if(route==='status'&&req.method==='GET')return {status:200,body:{mode:'paper',live_mode:false,namespace:ledger?.namespace??'operational',policy:ledger?.policy??null,admission:false,reason:ledger?'per_trade_approval_required':'risk_policy_and_authenticated_approval_unset'}};
    if(!['ledger','approval','submit','cancel','reduce','settle','policy/validate'].includes(route))return {status:404,body:{error:'unsupported_or_live_route_disabled'}};
    try{
      const principal=await identity(req);
      if(!principal?.authenticated || typeof principal.subject!=='string')throw new PaperError('authentication_required',401);
      if(route==='ledger'&&req.method==='GET'){
        if(!ledger)throw new PaperError('risk_policy_and_authenticated_approval_unset',409);
        return {status:200,body:ledger.view(principal)};
      }
      if(req.method!=='POST')throw new PaperError('method_not_allowed',405);
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)throw new PaperError('request_too_large',413);}
      let input;try{input=JSON.parse(body);}catch{throw new PaperError('invalid_json',400);}
      if(!input||typeof input!=='object'||Array.isArray(input))throw new PaperError('invalid_input',400);
      if(route==='policy/validate'){
        // Validation is NOT activation; approved numerical policy must arrive server-side.
        validatePolicy(input);return {status:200,body:{valid:true,activated:false,reason:'requires_server_owned_approved_policy'}};
      }
      if(!ledger)throw new PaperError('risk_policy_and_authenticated_approval_unset',409);
      if(route==='approval'){
        const approval=await requestApproval({principal,draft:input.draft,binding:fingerprint(input.draft||{}),confirmation:input.confirmation});
        if(!approval)throw new PaperError('existing_approval_gate_unavailable',409);
        return {status:200,body:{approval,mode:'paper'}};
      }
      const key=req.headers['idempotency-key'];
      const state=await getSnapshot();
      if(route==='settle'){
        // Remaining quantity is resolved inside the transaction, AFTER idempotency lookup.
        // Clients cannot select execution price, source, assumptions or fill quantity.
        return {status:200,body:ledger.transaction(principal,key,'settle',input,state)};
      }
      return {status:200,body:ledger.transaction(principal,key,route,input,state)};
    }catch(error){return {status:error instanceof PaperError?error.status:500,body:{ok:false,admitted:false,error:error instanceof PaperError?error.message:'paper_surface_unavailable'}};}
  };
}
