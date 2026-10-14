import { database,requireUser,authFailure,AuthError } from "../lib/auth.js";
import { consentRequest,grantConsent,revokeGrant,resource } from "../lib/mcp/oauth.js";
import { event } from "../lib/mcp/store.js";
export function createConnectionsHandler(connect=database,authorize=requireUser){
  return async(req,res)=>{
    if(!["GET","POST"].includes(req.method))return res.status(405).json({error:"Method not allowed."});
    const user=await authorize(req,res,"connections",90);if(!user)return;
    try{
      const sql=connect();
      if(req.method==="GET"){
        const requestId=req.query?.request;
        const consent=requestId?await consentRequest(sql,requestId):null;
        const connections=await sql`SELECT g.id,c.name,g.scopes,g.created_at,g.revoked_at FROM testify_mcp_grants g JOIN testify_mcp_clients c ON c.id=g.client_id WHERE g.user_id=${user.id} ORDER BY g.created_at DESC LIMIT 50`;
        const approvals=await sql`SELECT id,action,target_id,approved_at,expires_at FROM testify_mcp_approvals WHERE user_id=${user.id} AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC`;
        const activity=await sql`SELECT action,detail,created_at FROM testify_mcp_events WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 50`;
        const jobs=await sql`SELECT id,status,progress,errors,created_at FROM testify_mcp_jobs WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 50`;
        return res.status(200).json({endpoint:resource(),guest:user.email.endsWith("@preview.testify.invalid"),connections,approvals,activity,jobs,consent});
      }
      const b=typeof req.body==="string"?JSON.parse(req.body):req.body;
      if(!b||JSON.stringify(b).length>8192)throw new AuthError("Invalid connection action.",400);
      if(!/^[a-f0-9-]{36}$/.test(b.id || ""))throw new AuthError("Invalid connection ID.",400);
      if(b.action==="consent")return res.status(200).json({redirect:await grantConsent(sql,user,b.id,b.allow===true)});
      if(b.action==="disconnect"){await revokeGrant(sql,user.id,b.id);return res.status(200).json({disconnected:b.id});}
      if(b.action==="approve"||b.action==="deny"){
        if(b.action==="approve")await sql`UPDATE testify_mcp_approvals SET approved_at=now() WHERE id=${b.id} AND user_id=${user.id} AND consumed_at IS NULL AND expires_at>now() AND grant_id IN(SELECT id FROM testify_mcp_grants WHERE revoked_at IS NULL)`;
        else await sql`DELETE FROM testify_mcp_approvals WHERE id=${b.id} AND user_id=${user.id} AND consumed_at IS NULL`;
        await event(sql,{userId:user.id},b.action,{approvalId:b.id});return res.status(200).json({ok:true});
      }
      throw new AuthError("Unknown connection action.",400);
    }catch(e){return authFailure(res,e);}
  };
}
export default createConnectionsHandler();
