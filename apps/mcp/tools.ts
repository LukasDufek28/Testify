import { z } from "zod";
import { randomUUID } from "node:crypto";
import { database, AuthError, limit } from "../../lib/auth.js";
import { parseStrategy } from "../../lib/shared/types.js";
import { validateGeneratedStrategy } from "../../lib/server-execution.js";
import { listStrategies, getStrategy, saveStrategy } from "../../lib/services/strategies.js";
import { idempotent, event, listRunSummaries, getRunSummary, requestApproval, consumeApproval } from "../../lib/mcp/store.js";
import { createJob, getJob, cancelJob } from "../../lib/mcp/jobs.js";
import { summarizePortfolio } from "../../lib/mcp/summaries.js";
import { start } from "workflow/api";
import { backtestWorkflow } from "./workflows/backtest";
import { programmableInstructions } from "../../lib/strategy-instructions.js";
import { exampleStrategy } from "../../lib/shared/types.js";
import { getProgress,waitForProgress } from "../../lib/mcp/progress.js";
import { coinbase } from "../../lib/crypto-data.js";

const id=z.string().min(1).max(128), key=z.string().regex(/^[A-Za-z0-9_-]{8,128}$/), name=z.string().trim().min(1).max(100);
const settings=z.object({capital:z.number().positive().max(1e9),feeBps:z.number().min(0).max(1000),feePerTrade:z.number().min(0).max(1e9).optional(),slippageBps:z.number().min(0).max(1000),start:z.number().nonnegative(),end:z.number().positive(),warmupStart:z.number().nonnegative().optional()}).strict();
const research=z.object({phase:z.enum(["development","validation","holdout"]),fullStart:z.number(),fullEnd:z.number(),boundary:z.number(),holdoutStart:z.number().optional(),splitPct:z.number().positive().max(100).optional()}).strict();
const batch=z.object({idempotencyKey:key,name,markets:z.array(z.string().regex(/^[A-Z0-9]{2,20}-(USD|USDT)$/)).min(1),granularity:z.number(),strategyId:id,strategyRevision:z.number().int().positive(),settings,research}).strict();
const paging={limit:z.number().int().min(1).max(100).default(50),offset:z.number().int().nonnegative().default(0)};
type Identity={userId:string;grantId:string;scopes:string[]};
const runListing=(run:any)=>{const {curve,trades,strategySource,...summary}=run;return summary;};

export function registerTools(server: any, identity: Identity) {
  const add=(toolName:string,description:string,schema:any,scope:string,readOnly:boolean,fn:(sql:any,args:any)=>Promise<any>,destructive=false)=>{
    server.registerTool(toolName,{description,inputSchema:schema,annotations:{readOnlyHint:readOnly,destructiveHint:destructive,idempotentHint:!readOnly,openWorldHint:false},_meta:{securitySchemes:[{type:"oauth2",scopes:[scope]}]}},async(args:any)=>{
      try {
        if(!identity.scopes.includes(scope)) throw new AuthError("This connection does not have permission for this tool.",403);
        const sql=database();await limit(sql,"mcp-tools",identity.userId,120);
        const result=readOnly?await fn(sql,args):await idempotent(sql,identity.userId,args.idempotencyKey,{tool:toolName,...args},async()=>{
          const result=await fn(sql,args);await event(sql,identity,toolName,{id:result?.id || result?.jobId || result?.approvalId || null});return result;
        });
        return {content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result};
      }catch(error:any){console.error("Testify MCP action failed",toolName,error?.code || error?.name || "unknown");return {isError:true,content:[{type:"text",text:JSON.stringify({error:error instanceof AuthError?error.message:"The action could not complete. Check Testify activity and retry safely.",status:error instanceof AuthError?error.status:503})}]};}
    });
  };
  const launch=async(sql:any,input:any)=>{
    const job=await createJob(sql,identity,input);
    try {const run=await start(backtestWorkflow,[job.jobId]);await sql`UPDATE testify_mcp_jobs SET workflow_id=${run.runId} WHERE id=${job.jobId} AND user_id=${identity.userId}`;}
    catch(error){await sql`UPDATE testify_mcp_jobs SET status='failed',errors='[{"error":"Background dispatcher unavailable; no results were created."}]'::jsonb WHERE id=${job.jobId} AND status='queued'`;throw error;}
    return job;
  };
  add("workspace_info","Use first to discover exact strategy grammar/runtime instructions, research restrictions and cloud-storage capabilities.",z.object({}),"testify:read",true,async()=>({strategyFormats:[1,2,3],customLanguage:"JavaScript in QuickJS, not Rust or Python",strategyExample:exampleStrategy,programmableInstructions,timeframes:[60,300,900,1800,3600,14400,21600,86400],tradeLogs:"not_stored",curves:"daily-sampled",jobExecutionEnabled:process.env.MCP_JOBS_ENABLED==="true",instructions:"Use development results only to revise strategies. Freeze revision before submitting jobs. Never infer absent trade logs. Fixed feePerTrade is the entire round-trip fee."}));
  add("list_markets","List supported Coinbase online markets. Use actual product IDs, not invented symbols.",z.object({search:z.string().max(50).default(""),...paging}),"testify:read",true,async(_sql,args)=>{
    const products=await coinbase("/products");
    if(!Array.isArray(products))throw new AuthError("Market list temporarily unavailable.",502);
    const markets=products.filter((p:any)=>!p.trading_disabled && /-(USD|USDT)$/.test(p.id)&&p.id.toLowerCase().includes(args.search.toLowerCase())).map((p:any)=>p.id).sort();
    return {markets:markets.slice(args.offset,args.offset+args.limit),total:markets.length};
  });
  add("list_strategies","Search the account strategy library.",z.object({search:z.string().max(100).default(""),...paging}),"testify:read",true,async(sql,args)=>{
    const items=(await listStrategies(sql,identity.userId)).filter((s:any)=>s.name.toLowerCase().includes(args.search.toLowerCase()));return {strategies:items.slice(args.offset,args.offset+args.limit).map(({source,...s}:any)=>s),total:items.length};
  });
  add("get_strategy","Read the strategy JSON and revision before editing or running it.",z.object({id,revision:z.number().int().positive().optional()}),"testify:read",true,async(sql,args)=>({strategy:await getStrategy(sql,identity.userId,args.id,args.revision)}));
  add("validate_strategy","Validate Testify strategy JSON and sandbox custom code before saving.",z.object({source:z.string().max(100000)}),"testify:strategies",true,async(_sql,args)=>{try{const strategy=parseStrategy(args.source);await validateGeneratedStrategy(strategy);return {valid:true,strategy};}catch(e:any){throw new AuthError(e.message,400);}});
  add("save_strategy","Create or modify a strategy. expectedRevision=0 creates; stale edits are rejected. Context must contain development runs only.",z.object({idempotencyKey:key,id:id.optional(),source:z.string().max(100000),expectedRevision:z.number().int().nonnegative(),contextRunIds:z.array(id).default([])}),"testify:strategies",false,async(sql,args)=>{
    for(const runId of args.contextRunIds){const run=await getRunSummary(sql,identity.userId,runId);if(run.research?.phase!=="development")throw new AuthError("Only development results may guide strategy changes.",400);}
    return {strategy:await saveStrategy(sql,identity.userId,{...args,id:args.id || randomUUID()})};
  });
  add("rename_strategy","Rename an existing strategy and preserve version history.",z.object({idempotencyKey:key,id,name,expectedRevision:z.number().int().positive()}),"testify:strategies",false,async(sql,args)=>{
    const current=await getStrategy(sql,identity.userId,args.id);return {strategy:await saveStrategy(sql,identity.userId,{id:args.id,expectedRevision:args.expectedRevision,source:JSON.stringify({...parseStrategy(current.source),name:args.name})})};
  });
  add("start_backtest_batch","Submit a development batch; returns a job ID immediately. Dates must remain before the reserved boundary.",batch,"testify:backtests",false,launch);
  add("start_validation","Evaluate the frozen strategy from a development run in its original reserved period. Holdout requires website approval.",z.object({idempotencyKey:key,name,parentRunId:id,settings,research,approvalId:z.string().uuid().optional()}),"testify:backtests",false,launch);
  add("get_job","Get compact progress by default. Use wait_for_job with afterRevision to wait for changes without repeated calls. detail=full includes run summaries; holdout stays redacted.",z.object({id:z.string().uuid(),detail:z.enum(["summary","full"]).default("summary")}),"testify:read",true,async(sql,args)=>{
    if(args.detail!=="full")return getProgress(sql,identity.userId,args.id);
    const job=await getJob(sql,identity.userId,args.id);return {...job,runs:job.runs.map((r:any)=>r.research?.phase==="holdout"?{id:r.id,name:r.name,phase:"holdout",requiresApproval:true}:runListing(r))};
  });
  add("cancel_job","Cancel pending loading and execution for a batch.",z.object({idempotencyKey:key,id:z.string().uuid()}),"testify:backtests",false,async(sql,args)=>cancelJob(sql,identity.userId,args.id));
  add("wait_for_job","Wait up to 45 seconds for progress or completion, returning compact counts and cache statistics. Reuse revision as afterRevision. until=completed coalesces intermediate updates.",z.object({id:z.string().uuid(),afterRevision:z.number().int().nonnegative().optional(),waitSeconds:z.number().min(0).max(45).default(45),until:z.enum(["changed","completed"]).default("changed")}),"testify:read",true,async(sql,args)=>waitForProgress(sql,identity.userId,args.id,args.afterRevision,args.waitSeconds,undefined,args.until));
  add("list_runs","Search cloud run names. Holdout performance is excluded. Use purpose=improve for development-only context.",z.object({name:z.string().max(100).default(""),purpose:z.enum(["evaluate","improve"]).default("evaluate"),...paging}),"testify:read",true,async(sql,args)=>({runs:(await listRunSummaries(sql,identity.userId,args)).filter((r:any)=>r.research?.phase!=="holdout"&&(args.purpose!=="improve"||r.research?.phase==="development")).map(runListing),offset:args.offset,limit:args.limit}));
  add("get_run_summary","Read exact run metrics and sampled equity. Trade logs are not stored. Holdout access needs an approval ID.",z.object({id,purpose:z.enum(["evaluate","improve"]).default("evaluate"),approvalId:z.string().uuid().optional()}),"testify:read",true,async(sql,args)=>{
    const run=await getRunSummary(sql,identity.userId,args.id);
    if(args.purpose==="improve"&&run.research?.phase!=="development")throw new AuthError("Only development runs may guide improvements.",403);
    if(run.research?.phase==="holdout")await consumeApproval(sql,identity,args.approvalId,"holdout",args.id);
    return {run};
  });
  add("rename_run","Rename a cloud history summary; linked browser records synchronize on refresh.",z.object({idempotencyKey:key,id,name}),"testify:strategies",false,async(sql,args)=>{
    const run=await getRunSummary(sql,identity.userId,args.id);run.name=args.name;
    await sql`UPDATE testify_run_summaries SET payload=${JSON.stringify(run)}::jsonb,updated_at=now() WHERE user_id=${identity.userId} AND id=${args.id}`;return {id:args.id,name:args.name};
  });
  add("save_portfolio","Save a named selection of account-owned runs for later portfolio analysis.",z.object({idempotencyKey:key,id:z.string().uuid().optional(),name,runIds:z.array(id).min(1)}),"testify:strategies",false,async(sql,args)=>{
    for(const runId of args.runIds)await getRunSummary(sql,identity.userId,runId);
    const portfolioId=args.id||randomUUID();await sql`INSERT INTO testify_mcp_portfolios(user_id,id,name,run_ids) VALUES (${identity.userId},${portfolioId},${args.name},${JSON.stringify([...new Set(args.runIds)])}::jsonb) ON CONFLICT(user_id,id) DO UPDATE SET name=EXCLUDED.name,run_ids=EXCLUDED.run_ids`;return {id:portfolioId,name:args.name,runCount:args.runIds.length};
  });
  add("list_portfolios","List saved account portfolio selections.",z.object({...paging}),"testify:read",true,async(sql,args)=>({portfolios:await sql`SELECT id,name,run_ids FROM testify_mcp_portfolios WHERE user_id=${identity.userId} ORDER BY name LIMIT ${args.limit} OFFSET ${args.offset}`}));
  add("portfolio_summary","Calculate a portfolio from run IDs, a saved portfolio, or a run-name search, with daily sampling and full-capital sleeve accounting disclosed. Holdout is excluded.",z.object({runIds:z.array(id).optional(),portfolioId:z.string().uuid().optional(),name:z.string().max(100).optional(),purpose:z.enum(["evaluate","improve"]).default("evaluate")}).refine((a)=>!!a.runIds?.length||!!a.name||!!a.portfolioId,"Provide runIds, portfolioId or a name."),"testify:read",true,async(sql,args)=>{
    let runs;
    if(args.portfolioId){const [p]=await sql`SELECT run_ids FROM testify_mcp_portfolios WHERE user_id=${identity.userId} AND id=${args.portfolioId}`;if(!p)throw new AuthError("Portfolio not found.",404);args.runIds=p.run_ids;}
    if(args.runIds)runs=await Promise.all(args.runIds.map((runId:string)=>getRunSummary(sql,identity.userId,runId)));
    else {runs=[];let offset=0;while(true){const page=await listRunSummaries(sql,identity.userId,{name:args.name,limit:100,offset});runs.push(...page);if(page.length<100)break;offset+=100;}}
    runs=runs.filter((r:any)=>r.research?.phase!=="holdout");
    if(args.purpose==="improve"&&runs.some((r:any)=>r.research?.phase!=="development"))throw new AuthError("Portfolio improvement context must contain development runs only.",400);
    const summary=summarizePortfolio(runs);const {curve,...compact}=summary;
    return {...compact,curve:curve.filter((_:any,i:number)=>i===0||i===curve.length-1||i%Math.max(1,Math.ceil(curve.length/200))===0)};
  });
  add("request_sensitive_action","Request website confirmation for deleting a run/strategy or accessing holdout. This tool cannot approve its own request.",z.object({idempotencyKey:key,action:z.enum(["delete_run","delete_strategy","holdout"]),targetId:id}),"testify:read",false,async(sql,args)=>requestApproval(sql,identity,args.action,args.targetId));
  add("execute_sensitive_action","Execute an exact approved deletion. Approval is single-use and tied to account, connection and target.",z.object({idempotencyKey:key,approvalId:z.string().uuid(),action:z.enum(["delete_run","delete_strategy"]),targetId:id,expectedRevision:z.number().int().positive().optional()}),"testify:strategies",false,async(sql,args)=>{
    await consumeApproval(sql,identity,args.approvalId,args.action,args.targetId);
    if(args.action==="delete_run") await sql`DELETE FROM testify_run_summaries WHERE user_id=${identity.userId} AND id=${args.targetId}`;
    else {if(!args.expectedRevision)throw new AuthError("Expected revision required.",400);const rows=await sql`DELETE FROM testify_strategies WHERE user_id=${identity.userId} AND id=${args.targetId} AND revision=${args.expectedRevision} RETURNING id`;if(!rows.length)throw new AuthError("Strategy changed; request a new approval after reloading.",409);}
    return {deleted:args.targetId};
  },true);
}
