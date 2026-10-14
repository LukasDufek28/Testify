import { createMcpHandler } from "mcp-handler";
import { database } from "../../../../../lib/auth.js";
import { authenticateToken, resource, issuer } from "../../../../../lib/mcp/oauth.js";
import { registerTools } from "../../../tools";
export const runtime="nodejs";
export const maxDuration=60;
async function handle(request:Request) {
  const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  let identity;
  try {identity=await authenticateToken(database(),token);} catch {return Response.json({error:"Connection service is not configured."},{status:503});}
  if(!identity) return Response.json({error:"Connect your Testify account."},{status:401,headers:{"WWW-Authenticate":`Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource"`,"Cache-Control":"no-store"}});
  const handler=createMcpHandler(server=>registerTools(server,identity),{serverInfo:{name:"testify",version:"1.0.0"},instructions:"Research tools for Testify. Read workspace_info first. Write strategy JSON in supported formats, validate, save, then freeze a revision for backtests. Use development results only for improvements. Poll jobs instead of resubmitting. Daily cloud curves are sampled; full trades are not stored. Never claim guaranteed profitability. Holdout access and deletion require approval in Testify."});
  const response=await handler(request);response.headers.set("Cache-Control","no-store");return response;
}
export {handle as GET,handle as POST};
export function OPTIONS(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type,MCP-Protocol-Version,MCP-Session-Id","Access-Control-Expose-Headers":"WWW-Authenticate,MCP-Session-Id"}});}
