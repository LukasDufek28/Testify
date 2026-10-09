import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { registerClient,beginAuthorization,grantConsent,exchangeToken,authenticateToken,revokeGrant,validPkce,resource,hash } from "../lib/mcp/oauth.js";
import { idempotent,getRunSummary,requestApproval,consumeApproval } from "../lib/mcp/store.js";
import { createJob,validateJob,getJob,cancelJob } from "../lib/mcp/jobs.js";
import { fetchPage,executeMarket,finishJob,aggregateCandles,reserveProviderSlot } from "../lib/mcp/execution.js";
import { summarizeRun,summarizePortfolio } from "../lib/mcp/summaries.js";
import { exampleStrategy } from "../lib/shared/types.js";
import { runBacktest } from "../lib/shared/engine.js";
import { runServerBacktest,validateGeneratedStrategy } from "../lib/server-execution.js";
import { createCloudHandler } from "../api/research-cloud.js";
process.env.MCP_PUBLIC_URL="http://localhost:3001";
process.env.MCP_JOBS_ENABLED="true";
async function fixture(){
 const db=new PGlite();await db.exec(await readFile(new URL("../auth-schema.sql",import.meta.url),"utf8"));await db.exec(await readFile(new URL("../mcp-schema.sql",import.meta.url),"utf8"));
 const sql=(parts,...values)=>{const text=parts.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,"");return {run:async(tx)=>(await tx.query(text,values)).rows,then(resolve,reject){return this.run(db).then(resolve,reject);}};};
 sql.transaction=queries=>db.transaction(async(tx)=>{const result=[];for(const q of queries)result.push(await q.run(tx));return result;});
 const userId=randomUUID(),other=randomUUID();await db.query("INSERT INTO testify_accounts(id,email,password_hash) VALUES($1,'a@example.com','test'),($2,'b@example.com','test')",[userId,other]);
 const client=await registerClient(sql,{client_name:"Test client",redirect_uris:["http://localhost:9999/callback"]});
 const grantId=randomUUID();await db.query("INSERT INTO testify_mcp_grants(id,user_id,client_id,scopes) VALUES($1,$2,$3,'testify:read testify:strategies testify:backtests')",[grantId,userId,client.client_id]);
 const identity={userId,grantId};
 await db.query("INSERT INTO testify_strategies(user_id,id,name,source,revision) VALUES($1,'sample',$2,$3,1)",[userId,exampleStrategy.name,JSON.stringify(exampleStrategy)]);
 await db.query("INSERT INTO testify_strategy_versions(user_id,strategy_id,revision,source) VALUES($1,'sample',1,$2)",[userId,JSON.stringify(exampleStrategy)]);
 return {db,sql,userId,other,identity,client};
}
const input=()=>({name:"MCP run",strategyId:"sample",strategyRevision:1,markets:["BTC-USD"],granularity:3600,settings:{capital:10000,feeBps:2,feePerTrade:1,slippageBps:1,start:0,end:21*3600},research:{phase:"development",fullStart:0,boundary:21*3600,fullEnd:42*3600,splitPct:50}});
const rows=Array.from({length:21},(_,i)=>[i*3600,90+i,110+i,100+i,102+i,10]);

test("OAuth PKCE, exact redirects, resource binding, code replay, refresh rotation and revocation",async()=>{
 const f=await fixture();try{
  const verifier="v".repeat(43),challenge=createHash("sha256").update(verifier).digest("base64url");
  assert.equal(validPkce(verifier,challenge),true);assert.equal(validPkce("wrong",challenge),false);
  const p={client_id:f.client.client_id,redirect_uri:f.client.redirect_uris[0],response_type:"code",code_challenge_method:"S256",code_challenge:challenge,scope:"testify:read",resource:resource(),state:"state"};
  await assert.rejects(()=>beginAuthorization(f.sql,{...p,redirect_uri:"https://attacker.example"}));
  await assert.rejects(()=>beginAuthorization(f.sql,{...p,resource:"https://other.example/api/mcp"}));
  const id=await beginAuthorization(f.sql,p);
  const redirect=new URL(await grantConsent(f.sql,{id:f.userId,email:"a@example.com"},id,true));assert.equal(redirect.searchParams.get("state"),"state");
  await assert.rejects(()=>grantConsent(f.sql,{id:f.userId,email:"a@example.com"},id,true));
  const tokenInput={grant_type:"authorization_code",code:redirect.searchParams.get("code"),client_id:p.client_id,redirect_uri:p.redirect_uri,code_verifier:verifier,resource:resource()};
  await assert.rejects(()=>exchangeToken(f.sql,{...tokenInput,code_verifier:"x".repeat(43)}));
  const tokens=await exchangeToken(f.sql,tokenInput),identity=await authenticateToken(f.sql,tokens.access_token);assert.equal(identity.userId,f.userId);
  await assert.rejects(()=>exchangeToken(f.sql,tokenInput));
  const refreshed=await exchangeToken(f.sql,{grant_type:"refresh_token",refresh_token:tokens.refresh_token,client_id:p.client_id,resource:resource()});
  await assert.rejects(()=>exchangeToken(f.sql,{grant_type:"refresh_token",refresh_token:tokens.refresh_token,client_id:p.client_id,resource:resource()}));
  await f.sql`UPDATE testify_mcp_tokens SET expires_at=now()-interval '1 second' WHERE hash=${hash(tokens.access_token)}`;assert.equal(await authenticateToken(f.sql,tokens.access_token),null);
  assert.ok(await authenticateToken(f.sql,refreshed.access_token));
  await revokeGrant(f.sql,f.userId,identity.grantId);assert.equal(await authenticateToken(f.sql,refreshed.access_token),null);
 }finally{await f.db.close();}
});
test("guest consent, expired codes and unknown scopes are rejected",async()=>{
 const f=await fixture();try{
  const params={client_id:f.client.client_id,redirect_uri:f.client.redirect_uris[0],response_type:"code",code_challenge_method:"S256",code_challenge:"a".repeat(43),resource:resource()};
  await assert.rejects(()=>beginAuthorization(f.sql,{...params,scope:"admin"}));
  const id=await beginAuthorization(f.sql,params);await assert.rejects(()=>grantConsent(f.sql,{id:f.userId,email:"guest@preview.testify.invalid"},id,true));
  await f.sql`UPDATE testify_mcp_requests SET expires_at=now()-interval '1 second' WHERE id=${id}`;await assert.rejects(()=>grantConsent(f.sql,{id:f.userId,email:"a@example.com"},id,true));
 }finally{await f.db.close();}
});
test("idempotency caches results, rejects collisions and blocks simultaneous mutations",async()=>{
 const f=await fixture();try{
  let calls=0;const action=async()=>({id:++calls});
  assert.deepEqual(await idempotent(f.sql,f.userId,"test-key-123",{x:1},action),{id:1});
  assert.deepEqual(await idempotent(f.sql,f.userId,"test-key-123",{x:1},action),{id:1});assert.equal(calls,1);
  await assert.rejects(()=>idempotent(f.sql,f.userId,"test-key-123",{x:2},action));
  assert.deepEqual(await idempotent(f.sql,f.other,"test-key-123",{x:1},action),{id:2});
 }finally{await f.db.close();}
});
test("single-use approvals are bound to user, connection, action and target",async()=>{
 const f=await fixture();try{
  const a=await requestApproval(f.sql,f.identity,"delete_run","run-1");
  await assert.rejects(()=>consumeApproval(f.sql,f.identity,a.approvalId,"delete_run","run-1"));
  await f.sql`UPDATE testify_mcp_approvals SET approved_at=now() WHERE id=${a.approvalId}`;
  await assert.rejects(()=>consumeApproval(f.sql,{...f.identity,userId:f.other},a.approvalId,"delete_run","run-1"));
  await assert.rejects(()=>consumeApproval(f.sql,f.identity,a.approvalId,"delete_strategy","run-1"));
  await consumeApproval(f.sql,f.identity,a.approvalId,"delete_run","run-1");
  await assert.rejects(()=>consumeApproval(f.sql,f.identity,a.approvalId,"delete_run","run-1"));
 }finally{await f.db.close();}
});
test("jobs freeze strategy, enforce ownership, one batch, research windows and execution gate",async()=>{
 const f=await fixture();try{
  await assert.rejects(()=>createJob(f.sql,{...f.identity,userId:f.other},input()));
  await assert.rejects(()=>createJob(f.sql,f.identity,{...input(),settings:{...input().settings,end:22*3600}}));
  const j=await createJob(f.sql,f.identity,input());
  const [{config}]=await f.sql`SELECT config FROM testify_mcp_jobs WHERE id=${j.jobId}`;assert.equal(config.strategySource,JSON.stringify(exampleStrategy));
  await assert.rejects(()=>getJob(f.sql,f.other,j.jobId));await assert.rejects(()=>cancelJob(f.sql,f.other,j.jobId));
  await assert.rejects(()=>createJob(f.sql,f.identity,input()));
  await cancelJob(f.sql,f.userId,j.jobId);assert.equal((await getJob(f.sql,f.userId,j.jobId)).status,"cancelled");
  process.env.MCP_JOBS_ENABLED="false";await assert.rejects(()=>createJob(f.sql,f.identity,input()));process.env.MCP_JOBS_ENABLED="true";
 }finally{process.env.MCP_JOBS_ENABLED="true";await f.db.close();}
});
test("provider 429 waits at least a minute, honors Retry-After, and retries the same page",async()=>{
 const f=await fixture();try{
  const job=await createJob(f.sql,f.identity,input());
  const retry=await fetchPage(job.jobId,"BTC-USD",0,f.sql,async()=>new Response("",{status:429,headers:{"Retry-After":"90"}}));assert.equal(retry.retryAfter,90);
  assert.equal((await getJob(f.sql,f.userId,job.jobId)).status,"waiting_retry");
  assert.ok(await reserveProviderSlot(f.sql)>80000);
  const result=await fetchPage(job.jobId,"BTC-USD",0,f.sql,async()=>Response.json(rows));assert.equal(result.next,21*3600);
  let called=false;await fetchPage(job.jobId,"BTC-USD",0,f.sql,async()=>{called=true;throw Error();});assert.equal(called,false);
  await cancelJob(f.sql,f.userId,job.jobId);assert.equal((await fetchPage(job.jobId,"BTC-USD",0,f.sql)).cancelled,true);
 }finally{await f.db.close();}
});
test("server execution saves exact metrics and summary curves without trade logs and survives caller disconnect",async()=>{
 const f=await fixture();try{
  const j=await createJob(f.sql,f.identity,input());await fetchPage(j.jobId,"BTC-USD",0,f.sql,async()=>Response.json(rows));
  const {runId}=await executeMarket(j.jobId,"BTC-USD",f.sql);assert.equal(runId,`${j.jobId}-BTC-USD`);
  assert.equal((await executeMarket(j.jobId,"BTC-USD",f.sql)).runId,runId);
  const run=await getRunSummary(f.sql,f.userId,runId);assert.equal(run.summaryOnly,true);assert.deepEqual(run.trades,[]);assert.equal(run.tradeLogs,"not_stored");
  assert.ok(run.curve.length<21);await assert.rejects(()=>getRunSummary(f.sql,f.other,runId));
  assert.equal((await finishJob(j.jobId,[],f.sql)).status,"completed");
  assert.equal((await f.sql`SELECT * FROM testify_mcp_pages WHERE job_id=${j.jobId}`).length,0);
 }finally{await f.db.close();}
});
test("sampled portfolios disclose approximation and preserve sum-of-sleeves accounting",()=>{
 const runs=[-10,15].map((n,i)=>summarizeRun({id:`r${i}`,name:"Example",createdAt:0,symbol:"BTC-USD",strategyId:"s",strategyName:"S",settings:{capital:100,start:0,end:86400},metrics:{netReturnPct:n,maxDrawdownPct:10,tradeCount:1,totalFees:1},curve:[{time:0,equity:100},{time:86400,equity:100+n}],trades:[{pnl:n,reason:"Signal"}],warnings:[]}));
 const p=summarizePortfolio(runs);assert.equal(p.returnPct,5);assert.match(p.sampling,/daily-sampled/);assert.match(p.accounting,/not a shared-cash/);assert.equal(p.totalFees,2);
});
test("30M and 4H aggregation exclude incomplete future groups",()=>{
 const bars=rows.map(([time,low,high,open,close,volume])=>({time,low,high,open,close,volume,spread:0}));
 assert.equal(aggregateCandles(bars,14400,3600).length,5);
 const quarter=bars.slice(0,5).map((b,i)=>({...b,time:i*900}));assert.equal(aggregateCandles(quarter,1800,900).length,2);
});
test("validation and final holdout are fixed before development and cannot overlap",()=>{
 const base=input(),strategy={id:"s",revision:1,source:JSON.stringify(exampleStrategy)};
 const research={...base.research,holdoutStart:30*3600};
 assert.throws(()=>validateJob({...base,research:{...research,phase:"validation"},settings:{...base.settings,start:21*3600,end:31*3600}},strategy),/holdout/);
 assert.throws(()=>validateJob({...base,research:{...research,phase:"holdout"},settings:{...base.settings,start:29*3600,end:42*3600}},strategy),/reserved/);
 const validation=validateJob({...base,research:{...research,phase:"validation"},settings:{...base.settings,start:21*3600,end:30*3600}},strategy);
 assert.equal(validation.settings.end,30*3600);
});
test("warm-up feeds indicators but cannot trade or score before evaluation",async()=>{
 const bars=Array.from({length:80},(_,i)=>({time:i*3600,open:100+i,high:102+i,low:99+i,close:101+i,volume:1,spread:0}));
 const strategy={...exampleStrategy,entryLong:[{left:{kind:"close"},op:"gt",right:0}],exitLong:[],entryShort:[],exitShort:[],side:"long",stopLossPct:0,takeProfitPct:0};
 const settings={capital:10000,feeBps:0,feePerTrade:1,slippageBps:0,start:40*3600,end:79*3600,warmupStart:0};
 const data={id:"x",symbol:"BTC-USD",fileName:"Coinbase · 60m",bars};
 const local=runBacktest(data,strategy,settings,"s","name"),server=await runServerBacktest(data,strategy,settings,"s","name");
 assert.deepEqual(local.metrics,server.metrics);assert.deepEqual(local.trades,server.trades);assert.ok(local.trades.every(t=>t.entryTime>=settings.start));assert.ok(local.curve.every(p=>p.time>=settings.start));
 const script={version:3,runtime:"javascript",name:"Warmup",description:"",parameters:{},code:"let count=0; function onBar(ctx){count++;return count>20&&!ctx.position?{entry:{side:'long',allocationPct:10}}:{};}"};
 const custom=await runServerBacktest(data,script,settings,"s","name");assert.ok(custom.trades.every(t=>t.entryTime>=settings.start));assert.ok(custom.trades.length>0);
 await assert.rejects(()=>validateGeneratedStrategy({...script,code:"function onBar(ctx){while(true){} }"}));
 const abort=new AbortController();abort.abort();await assert.rejects(()=>runServerBacktest(data,script,settings,"s","name",abort.signal),/cancelled/);
});
test("browser summary upload is opt-in, drops trades and preserves ownership",async()=>{
 const f=await fixture();try{
  const handler=createCloudHandler(()=>f.sql,async(req)=>({id:req.user}));
  const call=async(user,method,body)=>{const res={statusCode:200,status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;}};await handler({method,body,user},res);return res;};
  const summary={id:"local",name:"Local run",createdAt:1,symbol:"BTC-USD",strategyId:"sample",strategyName:"S",settings:input().settings,research:input().research,metrics:{netReturnPct:0,maxDrawdownPct:0,tradeCount:1,totalFees:1},curve:[{time:0,equity:10000}],trades:[{pnl:999}]};
  assert.equal((await call(f.userId,"POST",{action:"upload",runs:[summary]})).statusCode,200);
  assert.deepEqual((await call(f.other,"GET")).body.runs,[]);
  assert.equal((await call(f.userId,"GET")).body.runs[0].trades,undefined);
  await call(f.other,"POST",{action:"delete",id:"local"});assert.equal((await call(f.userId,"GET")).body.runs.length,1);
 }finally{await f.db.close();}
});
