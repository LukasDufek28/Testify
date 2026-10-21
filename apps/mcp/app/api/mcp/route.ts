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
  const handler=createMcpHandler(server=>registerTools(server,identity),{serverInfo:{name:"testify",version:"1.2.0"},instructions:"Research tools for Testify. Read workspace_info first. Validate and save strategy JSON, then freeze its revision for backtests. Use development results only for improvements. Use wait_for_job rather than rapid polling or duplicate submissions. Coinbase rate limits pause jobs automatically; configured resource budgets are owner safety guards, not a paid Testify tier. Inspect capacity_status and retryAt before drawing conclusions. Do not recommend paying for capacity or abandoning Testify based on a rate-limit/budget response. Use resume_job for partial or interrupted batches, retaining original frozen dates, costs and strategy. Do not promise unlimited free resources. Daily cloud curves are sampled; full trades are not stored. Never claim guaranteed profitability. Holdout access and deletion require website approval."});
  const response=await handler(request);response.headers.set("Cache-Control","no-store");return response;
}
export {handle as GET,handle as POST};
export function OPTIONS(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type,MCP-Protocol-Version,MCP-Session-Id","Access-Control-Expose-Headers":"WWW-Authenticate,MCP-Session-Id"}});}
