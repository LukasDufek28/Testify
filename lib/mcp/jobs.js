import { randomUUID } from "node:crypto";
import { AuthError } from "../auth.js";
import { validateRange } from "../crypto-data.js";
import { getStrategy } from "../services/strategies.js";
import { digestSource } from "./summaries.js";
import { getRunSummary, consumeApproval } from "./store.js";
import { BudgetError } from "./capacity.js";
export function validateJob(input, strategy) {
  const {settings,granularity,markets}=input;
  if (!Array.isArray(markets) || !markets.length) throw new AuthError("Select at least one market.",400);
  if (!settings || !Number.isFinite(settings.capital) || settings.capital<=0 || settings.capital>1e9 || !Number.isFinite(settings.feeBps) || settings.feeBps<0 || settings.feeBps>1000 || !Number.isFinite(settings.slippageBps) || settings.slippageBps<0 || settings.slippageBps>1000 || (settings.feePerTrade!==undefined && (!Number.isFinite(settings.feePerTrade)||settings.feePerTrade<0||settings.feePerTrade>1e9))) throw new AuthError("Invalid trading costs or capital.",400);
  for (const market of markets) validateRange(market,granularity,settings.start,settings.end);
  const r=input.research;
  if (!r || !["development","validation","holdout"].includes(r.phase) || ![r.fullStart,r.fullEnd,r.boundary].every(Number.isFinite) || r.fullStart>=r.boundary || r.boundary>=r.fullEnd) throw new AuthError("An immutable research window is required.",400);
  if (r.phase==="development" && (settings.start<r.fullStart || settings.end>r.boundary)) throw new AuthError("Development dates overlap reserved data.",400);
  if (r.phase!=="development" && (settings.start<r.boundary || settings.end>r.fullEnd)) throw new AuthError("Validation dates must stay in the reserved period.",400);
  if (r.holdoutStart!==undefined && (!Number.isFinite(r.holdoutStart)||r.holdoutStart<=r.boundary||r.holdoutStart>=r.fullEnd)) throw new AuthError("Final holdout must follow the validation period.",400);
  if (r.phase==="validation" && r.holdoutStart!==undefined && settings.end>r.holdoutStart) throw new AuthError("Validation overlaps the untouched final holdout.",400);
  if (r.phase==="holdout" && (r.holdoutStart===undefined || settings.start<r.holdoutStart)) throw new AuthError("A final holdout must be reserved during development, before any validation.",400);
  if (settings.warmupStart!==undefined && (!Number.isFinite(settings.warmupStart) || settings.warmupStart<0 || settings.warmupStart>settings.start)) throw new AuthError("Invalid warm-up start.",400);
  return { name:String(input.name || "AI research run").trim().slice(0,100),markets:[...new Set(markets)],granularity,
    settings:{capital:settings.capital,feeBps:settings.feeBps,feePerTrade:settings.feePerTrade,slippageBps:settings.slippageBps,start:settings.start,end:settings.end,warmupStart:settings.warmupStart},
    research:{...r},strategyId:strategy.id,strategyRevision:strategy.revision,strategySource:strategy.source,sourceHash:digestSource(strategy.source),engineVersion:"testify-web-1" };
}
export async function reserveBudget(sql,key,max,amount=1) {
  if (!Number.isSafeInteger(max)||max<=0) throw new AuthError("Execution budget is not configured.",503);
  const rows=await sql`INSERT INTO testify_mcp_budgets(key,value) SELECT ${key},${amount}::bigint WHERE ${amount}::bigint<=${max}::bigint ON CONFLICT(key) DO UPDATE SET value=testify_mcp_budgets.value+${amount}::bigint WHERE testify_mcp_budgets.value+${amount}::bigint<=${max}::bigint RETURNING value`;
  if (!rows.length) {const [usage]=await sql`SELECT value FROM testify_mcp_budgets WHERE key=${key}`;throw new BudgetError(key.split(":")[0],max,Number(usage?.value||0));}
}
export async function reserveBudgets(sql,entries) {
  for(const e of entries)if(!Number.isSafeInteger(e.max)||e.max<=0)throw new AuthError("Execution budget is not configured.",503);
  try {await sql.transaction(entries.map(({key,max,amount=1})=>sql`WITH claim AS (INSERT INTO testify_mcp_budgets(key,value) SELECT ${key},${amount}::bigint WHERE ${amount}::bigint<=${max}::bigint ON CONFLICT(key) DO UPDATE SET value=testify_mcp_budgets.value+${amount}::bigint WHERE testify_mcp_budgets.value+${amount}::bigint<=${max}::bigint RETURNING value) SELECT 1/count(*) AS admitted FROM claim`));}
  catch(error){if(error.code!=="22012")throw error;for(const e of entries){const [row]=await sql`SELECT value FROM testify_mcp_budgets WHERE key=${e.key}`;if(Number(row?.value||0)+(e.amount||1)>e.max)throw new BudgetError(e.key.split(":")[0],e.max,Number(row?.value||0));}throw new AuthError("Another batch reserved the remaining budget. Retry shortly.",429);}
}
export async function createJob(sql,identity,input) {
  if (process.env.MCP_JOBS_ENABLED!=="true") throw new AuthError("Remote execution is disabled until hosting allowances are verified.",503);
  let strategy;
  if (input.parentRunId) {
    const parent=await getRunSummary(sql,identity.userId,input.parentRunId);
    if (parent.research?.phase!=="development" || !parent.strategySource) throw new AuthError("Validation requires a frozen development run.",400);
    if (input.settings.start<parent.research.boundary || input.settings.end>parent.research.fullEnd) throw new AuthError("Validation must use the original reserved window.",400);
    strategy={id:parent.strategyId,revision:parent.strategyRevision,source:parent.strategySource};
    input={...input,markets:[parent.symbol],granularity:parent.granularity,research:{...parent.research,phase:input.research?.phase === "holdout" ? "holdout" : "validation",parentRunId:parent.id}};
  } else {
    if (input.research?.phase!=="development") throw new AuthError("Use start_validation with a frozen development run.",400);
    strategy=await getStrategy(sql,identity.userId,input.strategyId,input.strategyRevision);
  }
  const config=validateJob(input,strategy);
  if (config.research.phase==="holdout") await consumeApproval(sql,identity,input.approvalId,"holdout",input.parentRunId);
  const active=await sql`SELECT id FROM testify_mcp_jobs WHERE user_id=${identity.userId} AND status IN ('queued','loading','running','waiting_retry')`;
  if (active.length) {const e=new AuthError(`A batch is already active: ${active[0].id}`,409);e.existingJobId=active[0].id;throw e;}
  const month=new Date().toISOString().slice(0,7);
  await reserveBudgets(sql,[{key:`jobs:${month}`,max:Number(process.env.MCP_MONTHLY_JOB_LIMIT||100)},{key:`events:${month}`,max:Number(process.env.MCP_MONTHLY_EVENT_BUDGET||40000),amount:50}]);
  const id=randomUUID();
  try { await sql`INSERT INTO testify_mcp_jobs(id,user_id,grant_id,config) VALUES (${id},${identity.userId},${identity.grantId},${JSON.stringify(config)}::jsonb)`; }
  catch(error) { if (error.code==="23505") throw new AuthError("A batch is already active.",409); throw error; }
  return {jobId:id,status:"queued",executionVersion:0};
}
export async function resumeJob(sql,identity,id,approvalId) {
  if(process.env.MCP_JOBS_ENABLED!=="true")throw new AuthError("Remote execution is disabled by the site owner.",503);
  const [job]=await sql`SELECT config,status,progress FROM testify_mcp_jobs WHERE id=${id} AND user_id=${identity.userId}`;
  if(!job)throw new AuthError("Job not found.",404);
  if(["queued","loading","running","waiting_retry"].includes(job.status))return {jobId:id,status:job.status,alreadyActive:true};
  if(job.status==="completed")return {jobId:id,status:job.status,alreadyCompleted:true};
  if(job.config.research.phase==="holdout")await consumeApproval(sql,identity,approvalId,"holdout",job.config.research.parentRunId);
  const completed=(await sql`SELECT payload->>'symbol' AS symbol FROM testify_run_summaries WHERE job_id=${id} AND user_id=${identity.userId}`).map(r=>r.symbol);
  const progress=job.progress||{};progress.markets??={};
  for(const market of job.config.markets)progress.markets[market]=completed.includes(market)?{...progress.markets[market],status:"completed"}:{...progress.markets[market],status:"queued",loadedSlots:0,receivedCandles:0,error:null,waitKind:null,retryAt:null};
  try{const rows=await sql`UPDATE testify_mcp_jobs SET status='queued',cancel_requested=false,grant_id=${identity.grantId},errors='[]'::jsonb,progress=${JSON.stringify(progress)}::jsonb,updated_at=now(),progress_revision=progress_revision+1,execution_version=execution_version+1 WHERE id=${id} AND user_id=${identity.userId} AND status IN ('failed','partial','cancelled') RETURNING id,execution_version`;return {jobId:id,status:"queued",executionVersion:rows[0]?.execution_version,alreadyActive:!rows.length,resumed:true};}
  catch(e){if(e.code==="23505")throw new AuthError("Another batch is active. Wait for it to finish before resuming.",409);throw e;}
}
export async function getJob(sql,userId,id) {
  const [row]=await sql`SELECT id,status,progress,errors,cancel_requested,created_at,updated_at FROM testify_mcp_jobs WHERE id=${id} AND user_id=${userId}`;
  if (!row) throw new AuthError("Job not found.",404);
  const runs=(await sql`SELECT payload FROM testify_run_summaries WHERE job_id=${id} AND user_id=${userId}`).map(r=>r.payload);
  return {...row,runs};
}
export async function cancelJob(sql,userId,id) {
  const rows=await sql`UPDATE testify_mcp_jobs SET cancel_requested=true,status=CASE WHEN status IN ('queued','waiting_retry') THEN 'cancelled' ELSE status END,progress_revision=progress_revision+1,updated_at=now() WHERE id=${id} AND user_id=${userId} RETURNING id,status`;
  if (!rows.length) throw new AuthError("Job not found.",404); return rows[0];
}
