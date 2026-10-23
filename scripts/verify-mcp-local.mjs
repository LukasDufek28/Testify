// Uses an isolated disposable account; never prints credentials. Defaults to local endpoints.
import { randomUUID,randomBytes,createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { exampleStrategy } from "../lib/shared/types.js";
import { adaptiveTrendStrategy } from "../lib/shared/strategy-examples.js";
const site=process.env.TESTIFY_VERIFY_SITE || "http://127.0.0.1:5174",backend=process.env.TESTIFY_VERIFY_BACKEND || "http://127.0.0.1:3001",issuer=process.env.TESTIFY_VERIFY_ISSUER || "http://localhost:3001",sql=neon(process.env.DATABASE_URL);
let userId,clientId,access,cookie,sessionId;
async function siteCall(path,body){const response=await fetch(`${site}${path}`,{method:body?"POST":"GET",headers:{Origin:site,"Content-Type":"application/json",...(cookie?{Cookie:cookie,"X-Testify-Session":sessionId}:{})},...(body?{body:JSON.stringify(body)}:{})});const json=await response.json();if(!response.ok)throw Error(`${path}: ${json.error}`);if(response.headers.get("set-cookie"))cookie=response.headers.get("set-cookie").split(";")[0];return json;}
async function rpc(method,params){const response=await fetch(`${backend}/api/mcp`,{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json",Accept:"application/json, text/event-stream","MCP-Protocol-Version":"2025-11-25"},body:JSON.stringify({jsonrpc:"2.0",id:randomUUID(),method,params})});const text=await response.text();if(!response.ok)throw Error(`MCP HTTP ${response.status}: ${text.slice(0,300)}`);let json;if(text.startsWith("event:")||text.startsWith("data:")){const data=text.split("\n").filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trim());json=JSON.parse(data.at(-1));}else json=JSON.parse(text);if(json.error)throw Error(JSON.stringify(json.error));if(json.result?.isError)throw Error(json.result.content[0].text);return json.result;}
async function tool(name,args={}){const result=await rpc("tools/call",{name,arguments:args});return result.structuredContent || JSON.parse(result.content[0].text);}
try{
 const account=await siteCall("/api/auth",{action:"register",email:`mcp-check-${randomUUID()}@example.com`,password:randomBytes(24).toString("base64url")});userId=account.user.id;sessionId=account.user.sessionId;
 const clientResponse=await fetch(`${backend}/oauth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_name:"Local verification",redirect_uris:["http://localhost:9999/callback"]})});const client=await clientResponse.json();if(!clientResponse.ok)throw Error("Client registration failed");clientId=client.client_id;
 const verifier=randomBytes(32).toString("base64url"),challenge=createHash("sha256").update(verifier).digest("base64url");
 const authorize=await fetch(`${backend}/oauth/authorize?${new URLSearchParams({client_id:clientId,redirect_uri:client.redirect_uris[0],response_type:"code",code_challenge_method:"S256",code_challenge:challenge,scope:"testify:read testify:strategies testify:backtests",resource:`${issuer}/api/mcp`,state:"verify"})}`,{redirect:"manual"});if(authorize.status!==302)throw Error("Authorization redirect failed");
 const requestId=new URL(authorize.headers.get("location")).searchParams.get("mcpAuthorize");
 await siteCall(`/api/connections?request=${requestId}`);
 const consent=await siteCall("/api/connections",{action:"consent",id:requestId,allow:true});
 const tokenResponse=await fetch(`${backend}/oauth/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code:new URL(consent.redirect).searchParams.get("code"),client_id:clientId,redirect_uri:client.redirect_uris[0],code_verifier:verifier,resource:`${issuer}/api/mcp`})});const tokens=await tokenResponse.json();if(!tokenResponse.ok)throw Error("Token exchange failed");access=tokens.access_token;
 const init=await rpc("initialize",{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"testify-local-check",version:"1.0"}});console.log(`MCP initialized: ${init.serverInfo.name}`);
 const catalog=await rpc("tools/list",{});console.log(`Tool discovery: ${catalog.tools.length} tools`);
 await tool("workspace_info");
 const capacity=await tool("capacity_status");if(capacity.paymentRequired!==false)throw Error("Capacity must not imply a paid Testify plan.");
 await tool("validate_strategy",{source:JSON.stringify(adaptiveTrendStrategy)});console.log("Custom strategy sandbox validation passed.");
 const strategy=process.env.TESTIFY_VERIFY_CUSTOM === "true" ? adaptiveTrendStrategy : exampleStrategy;
 const saved=await tool("save_strategy",{idempotencyKey:randomUUID(),id:"verify-strategy",source:JSON.stringify(strategy),expectedRevision:0});console.log(`Strategy save/revision: ${saved.strategy.revision}`);
 await tool("rename_strategy",{idempotencyKey:randomUUID(),id:"verify-strategy",name:"Verified strategy",expectedRevision:1});
 const start=Date.parse("2026-09-01T00:00:00Z")/1000,end=Date.parse("2026-09-08T00:00:00Z")/1000;
 const job=await tool("start_backtest_batch",{idempotencyKey:randomUUID(),name:"Local MCP verification",markets:["BTC-USD","ETH-USD"],granularity:3600,strategyId:"verify-strategy",strategyRevision:2,settings:{capital:10000,feeBps:2,feePerTrade:1,slippageBps:1,start,end},research:{phase:"development",fullStart:start,boundary:end,fullEnd:end+7*86400,splitPct:50}});console.log("Background job submitted; no browser session is needed from here.");
 let completed;
 for(let i=0;i<4;i++){const progress=await tool("wait_for_job",{id:job.jobId,until:"completed",waitSeconds:45});console.log(progress.summary);if(["completed","partial","failed","cancelled"].includes(progress.status)){console.log(`Provider requests: ${progress.data.providerRequests}; cached pages: ${progress.data.cachedPages}`);completed=await tool("get_job",{id:job.jobId,detail:"full"});break;}}
 if(!completed)throw Error("Local workflow did not finish within two minutes.");
 if(completed.status!=="completed")throw Error(`Job ${completed.status}: ${JSON.stringify(completed.errors)}`);
 console.log(`Background batch completed: ${completed.runs.length} market summaries`);
 if(process.env.TESTIFY_VERIFY_RECOVERY==='true'){
  const kept=completed.runs.find(r=>r.symbol==='BTC-USD');
  // Simulate a partial failure only inside this disposable verification account.
  await sql`DELETE FROM testify_run_summaries WHERE user_id=${userId} AND job_id=${job.jobId} AND payload->>'symbol'='ETH-USD'`;
  await sql`UPDATE testify_mcp_jobs SET status='partial',errors='[{"market":"ETH-USD","error":"Verification interruption"}]'::jsonb WHERE id=${job.jobId} AND user_id=${userId}`;
  await tool('resume_job',{idempotencyKey:randomUUID(),id:job.jobId});
  const recovery=await tool('wait_for_job',{id:job.jobId,until:'completed',waitSeconds:45});
  if(recovery.status!=='completed')throw Error(`Recovery ${recovery.status}`);
  const recovered=await tool('get_job',{id:job.jobId,detail:'full'});
  if(recovered.runs.length!==2||recovered.runs.find(r=>r.symbol==='BTC-USD').createdAt!==kept.createdAt)throw Error('Recovery duplicated a successful market.');
  console.log('Frozen-batch recovery passed; successful BTC market was preserved.');
 }
 const portfolio=await tool("portfolio_summary",{name:"Local MCP verification",purpose:"improve"});console.log(`Portfolio summary: ${portfolio.runCount} runs; sampling disclosure present: ${!!portfolio.sampling}`);
 const cloud=await siteCall("/api/research-cloud");if(cloud.runs.length!==2)throw Error("Website did not receive both summaries.");console.log("Website history API receives both summaries.");
 await tool("rename_run",{idempotencyKey:randomUUID(),id:cloud.runs[0].id,name:"Renamed verification"});
 const approval=await tool("request_sensitive_action",{idempotencyKey:randomUUID(),action:"delete_run",targetId:cloud.runs[0].id});await siteCall("/api/connections",{action:"approve",id:approval.approvalId});await tool("execute_sensitive_action",{idempotencyKey:randomUUID(),approvalId:approval.approvalId,action:"delete_run",targetId:cloud.runs[0].id});console.log("Website approval and sensitive action verified.");
 console.log("Local end-to-end verification passed.");
}finally{
 if(userId)await sql`DELETE FROM testify_accounts WHERE id=${userId}`;
 if(clientId)await sql`DELETE FROM testify_mcp_clients WHERE id=${clientId}`;
 console.log("Disposable verification account removed.");
}
