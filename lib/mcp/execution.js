import { database, AuthError } from "../auth.js";
import { runServerBacktest } from "../server-execution.js";
import { parseStrategy } from "../shared/types.js";
import { validateData } from "../shared/data-validation.js";
import { summarizeRun } from "./summaries.js";
import { reserveBudget } from "./jobs.js";
import { randomUUID } from "node:crypto";
import { PAGE_CANDLES,cacheWindow,readCache,cacheLease,releaseCacheLease,writeCache,missingRanges } from "./candle-cache.js";
import { reserveProviderSlot,providerCooldown } from "./provider.js";
import { BudgetError } from "./capacity.js";
export { reserveProviderSlot } from "./provider.js";
const activeStates = ['queued','loading','running','waiting_retry'];
export async function loadJobRecord(id,sql=database()) {
  const [job]=await sql`SELECT j.*,g.revoked_at FROM testify_mcp_jobs j LEFT JOIN testify_mcp_grants g ON g.id=j.grant_id WHERE j.id=${id}`;
  if (!job) throw new Error("Job not found.");
  return job;
}
export const cancelled = job => job.cancel_requested || job.revoked_at || !activeStates.includes(job.status);
export async function loadMarketChunk(id,market,cursor,version=0,sql=database(),request=fetch) {
  const job=await loadJobRecord(id,sql),plan=pagePlan(job.config,market);
  if(cancelled(job)||job.execution_version!==version)return {cancelled:true,cursor};
  const pause=async error=>{
    await marketProgress(sql,id,market,"waiting_retry",{waitKind:"budget",retryAt:Date.parse(error.retryAt),reason:error.message,resource:error.resource});
    return {cursor:plan.start,budgetWait:Math.max(1000,Date.parse(error.retryAt)-Date.now())};
  };
  try{await reserveBudget(sql,`events:${new Date().toISOString().slice(0,7)}`,Number(process.env.MCP_MONTHLY_EVENT_BUDGET||40000),20);}catch(e){if(e instanceof BudgetError)return pause(e);throw e;}
  const deadline=Date.now()+15000;
  for(let i=0;i<6&&cursor<plan.end&&Date.now()<deadline;i++){
    let result;
    try{result=await fetchPage(id,market,cursor,sql,request,version);}catch(e){if(e instanceof BudgetError)return pause(e);throw e;}
    if(result.cancelled)return {cancelled:true,cursor};
    if(result.retryAfter)return {cursor,retryAfter:result.retryAfter};
    if(result.rateWait)return {cursor,rateWait:result.rateWait};
    cursor=result.next;
  }
  return {cursor,done:cursor>=plan.end};
}
export function pagePlan(config,market) {
  const interval=config.granularity===1800?900:config.granularity===14400?3600:config.granularity;
  const start=Math.ceil((config.settings.warmupStart ?? config.settings.start)/config.granularity)*config.granularity;
  const end=Math.floor(config.settings.end/config.granularity)*config.granularity;
  return {market,interval,start,end};
}
export function normalizeCandles(rows,start,end) {
  if (!Array.isArray(rows)) throw new Error("Market data returned invalid candles.");
  const unique=new Map();
  for (const row of rows) {
    if (!Array.isArray(row)||row.length<6) continue;
    const [time,low,high,open,close,volume]=row.map(Number);
    if (time<start||time>=end||![time,low,high,open,close,volume].every(Number.isFinite)||low<=0||high<Math.max(low,open,close)||low>Math.min(open,close)||volume<0) continue;
    unique.set(time,{time,low,high,open,close,volume,spread:0});
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time);
}
export function aggregateCandles(bars,granularity,interval) {
  if (interval===granularity) return bars;
  const groups=new Map();
  for (const b of bars) {const time=Math.floor(b.time/granularity)*granularity;const group=groups.get(time)||[];group.push(b);groups.set(time,group);}
  const count=granularity/interval;
  return [...groups].filter(([time,g])=>g.length===count&&g.every((b,i)=>b.time===time+i*interval)).map(([time,g])=>({time,open:g[0].open,high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low)),close:g.at(-1).close,volume:g.reduce((a,b)=>a+b.volume,0),spread:0}));
}
export async function fetchPage(id,market,cursor,sql=database(),request=fetch,executionVersion) {
  const job=await loadJobRecord(id,sql);
  if (cancelled(job)||(executionVersion!==undefined&&job.execution_version!==executionVersion)) return {cancelled:true};
  const config=job.config,plan=pagePlan(config,market),window=cacheWindow(cursor,plan.interval),to=Math.min(plan.end,window.end);
  if(to<=cursor)throw new Error("Requested candle range includes uncompleted candles.");
  const existing=await sql`SELECT cursor FROM testify_mcp_pages WHERE job_id=${id} AND market=${market} AND cursor=${cursor} AND expires_at>now()`;
  if (existing.length) {
    const [counts]=await sql`SELECT coalesce(sum(jsonb_array_length(payload)),0) AS candles FROM testify_mcp_pages WHERE job_id=${id} AND market=${market} AND expires_at>now()`;
    await marketProgress(sql,id,market,"loading",{cursor:to,loadedSlots:Math.floor((to-plan.start)/plan.interval),receivedCandles:Number(counts.candles)});
    return {next:to};
  }
  let cached=await readCache(sql,market,plan.interval,window.bucket),allBars=cached?.bars||[];
  let hit=cached?.fresh&&cached.coveredEnd>=to;
  const owner=randomUUID();
  const leased=!hit;
  if(leased){
    if(!(await cacheLease(sql,market,plan.interval,window.bucket,owner)))return {rateWait:1000};
    cached=await readCache(sql,market,plan.interval,window.bucket);allBars=cached?.bars||[];hit=cached?.fresh&&cached.coveredEnd>=to;
  }
  // Fresh incomplete responses are cached briefly too, avoiding repeated requests for unavailable listing dates.
  const ranges=hit?[]:missingRanges(allBars,window.bucket,window.end,plan.interval);
  try {
  for(const [from,end] of ranges) {
  if(!(await cacheLease(sql,market,plan.interval,window.bucket,owner)))return {rateWait:1000};
  let wait=await reserveProviderSlot(sql);
  while(wait>0&&wait<=2000){await new Promise(r=>setTimeout(r,wait));if(cancelled(await loadJobRecord(id,sql)))return {cancelled:true};wait=await reserveProviderSlot(sql);}
  if(wait>0){await marketProgress(sql,id,market,"waiting_retry",{cursor,retryAt:Date.now()+wait,reason:"Shared provider cooldown"});return {rateWait:wait};}
  const month=new Date().toISOString().slice(0,7);
  await reserveBudget(sql,`pages:${month}`,Number(process.env.MCP_MONTHLY_PAGE_LIMIT || 5000));
  const query=new URLSearchParams({granularity:String(plan.interval),start:new Date(from*1000).toISOString(),end:new Date(end*1000).toISOString()});
  await sql`UPDATE testify_mcp_jobs SET progress=jsonb_set(progress,'{markets}',coalesce(progress->'markets','{}'::jsonb)||jsonb_build_object(${market}::text,coalesce(progress->'markets'->${market}::text,'{}'::jsonb)||jsonb_build_object('status','loading','providerRequests',coalesce((progress->'markets'->${market}::text->>'providerRequests')::integer,0)+1))),status='loading',progress_revision=progress_revision+1,updated_at=now() WHERE id=${id} AND status IN ('queued','loading','running','waiting_retry')`;
  let response;
  try {response=await request(`https://api.exchange.coinbase.com/products/${market.toLowerCase()}/candles?${query}`,{headers:{Accept:"application/json","User-Agent":"Testify/1.0"},signal:AbortSignal.timeout(12000)});}
  catch {await marketProgress(sql,id,market,"waiting_retry",{cursor,reason:"Market-data connection interrupted",retryAt:Date.now()+60000});return {retryAfter:60};}
  if (response.status===429||response.status>=500) {
    const wait=await providerCooldown(sql,response);
    await marketProgress(sql,id,market,"waiting_retry",{cursor,reason:`Provider HTTP ${response.status}`,retryAt:Date.now()+wait*1000});
    return {retryAfter:wait};
  }
  if (!response.ok) throw new Error(`Coinbase market data request failed (${response.status}).`);
  const fetched=normalizeCandles(await response.json(),from,end).filter(b=>b.time%plan.interval===0);
  allBars=[...new Map([...allBars,...fetched].map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);
  await writeCache(sql,market,plan.interval,window.bucket,allBars,false,end);
  }
  if(!hit)await writeCache(sql,market,plan.interval,window.bucket,allBars,allBars.length===(window.end-window.bucket)/plan.interval && window.end===window.bucket+PAGE_CANDLES*plan.interval,window.end);
  const bars=allBars.filter(b=>b.time>=cursor&&b.time<to);
  const payload=JSON.stringify(bars);
  // A small, temporary checkpoint budget; candle pages are never permanent history.
  const max=Number(process.env.MCP_TEMP_STORAGE_BYTES || 25000000);
  const latest=await loadJobRecord(id,sql);
  if (cancelled(latest)||(executionVersion!==undefined&&latest.execution_version!==executionVersion)) return {cancelled:true};
  const saved=await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(7482942)`,
    sql`DELETE FROM testify_mcp_pages WHERE expires_at<now() OR (job_id=${id} AND market=${market} AND cursor=${cursor})`,
    sql`INSERT INTO testify_mcp_pages(job_id,market,cursor,payload,expires_at) SELECT ${id},${market},${cursor},${payload}::jsonb,now()+interval '24 hours' WHERE (SELECT coalesce(sum(octet_length(payload::text)),0) FROM testify_mcp_pages)+octet_length((${payload}::jsonb)::text)<=${max}::bigint RETURNING cursor`,
  ]);
  if(!saved[2].length)throw new AuthError("Temporary candle storage budget reached. Try fewer simultaneous markets or a larger timeframe.",429);
  const previous=job.progress?.markets?.[market]||{};
  await marketProgress(sql,id,market,"loading",{cursor:to,end:plan.end,loadedSlots:Math.floor((to-plan.start)/plan.interval),receivedCandles:Number(previous.receivedCandles||0)+bars.length,cachedPages:Number(previous.cachedPages||0)+(hit?1:0),retryAt:null,waitKind:null});
  return {next:to};
  } finally {if(leased)await releaseCacheLease(sql,market,plan.interval,window.bucket,owner);}
}
export async function marketProgress(sql,id,market,status,progress={}) {
  await sql`UPDATE testify_mcp_jobs SET status=CASE WHEN ${status} IN ('loading','running','waiting_retry') THEN ${status} ELSE status END,progress=jsonb_set(progress,'{markets}',coalesce(progress->'markets','{}'::jsonb)||jsonb_build_object(${market}::text,coalesce(progress->'markets'->${market}::text,'{}'::jsonb)||${JSON.stringify({...progress,status})}::jsonb)),progress_revision=progress_revision+1,updated_at=now() WHERE id=${id} AND status IN ('queued','loading','running','waiting_retry')`;
}
export async function setProgress(sql,id,status,progress) {
  await sql`UPDATE testify_mcp_jobs SET status=${status},progress=${JSON.stringify(progress)}::jsonb,progress_revision=progress_revision+1,updated_at=now() WHERE id=${id} AND status IN ('queued','loading','running','waiting_retry')`;
}
export async function executeMarket(id,market,sql=database(),executionVersion) {
  const job=await loadJobRecord(id,sql);
  if (cancelled(job)||(executionVersion!==undefined&&job.execution_version!==executionVersion)) return {cancelled:true};
  const config=job.config,runId=`${id}-${market}`;
  const existing=await sql`SELECT id FROM testify_run_summaries WHERE user_id=${job.user_id} AND id=${runId}`;
  if (existing.length) {await marketProgress(sql,id,market,"completed",{runId});return {runId};}
  const pages=await sql`SELECT payload FROM testify_mcp_pages WHERE job_id=${id} AND market=${market} AND expires_at>now() ORDER BY cursor`;
  const expectedPlan=pagePlan(config,market);
  let expectedPages=0;for(let t=expectedPlan.start;t<expectedPlan.end;){expectedPages++;t=Math.min(expectedPlan.end,(Math.floor(t/(PAGE_CANDLES*expectedPlan.interval))+1)*PAGE_CANDLES*expectedPlan.interval);}
  if(pages.length!==expectedPages) throw new Error("Temporary candle checkpoints expired or are incomplete. Resubmit the original period; it has not been shortened.");
  const base=[...new Map(pages.flatMap(p=>p.payload).map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);
  const plan=pagePlan(config,market),bars=aggregateCandles(base,config.granularity,plan.interval);
  const coverage=validateData(bars,config.settings.start,config.settings.end,config.granularity);
  if (coverage.received<20) throw new Error("At least 20 evaluation candles are required; check coverage or listing dates.");
  await marketProgress(sql,id,market,"running",{candles:bars.length,coverage});
  const controller=new AbortController();
  const timer=setInterval(()=>{void loadJobRecord(id,sql).then(j=>{if(cancelled(j)||(executionVersion!==undefined&&j.execution_version!==executionVersion)) controller.abort();}).catch(()=>controller.abort());},1000);
  try {
    const run=await runServerBacktest({id:"mcp",symbol:market,fileName:`Coinbase · ${config.granularity/60}m`,bars,importedAt:Date.now(),skipped:0},parseStrategy(config.strategySource),config.settings,config.strategyId,config.name,controller.signal);
    const latest=await loadJobRecord(id,sql);
    if (cancelled(latest)||(executionVersion!==undefined&&latest.execution_version!==executionVersion)) return {cancelled:true};
    Object.assign(run,{id:runId,granularity:config.granularity,strategySource:config.strategySource,strategyRevision:config.strategyRevision,engineVersion:config.engineVersion,research:config.research,coverage});
    if (coverage.missing) run.warnings.push(`${coverage.missing} candles missing; ${coverage.coveragePct.toFixed(2)}% coverage. Requested period was not shortened.`);
    const summary=summarizeRun(run);
    await sql`INSERT INTO testify_run_summaries(user_id,id,job_id,payload) VALUES (${job.user_id},${runId},${id},${JSON.stringify(summary)}::jsonb) ON CONFLICT(user_id,id) DO NOTHING`;
    await marketProgress(sql,id,market,"completed",{runId});
    return {runId};
  } finally {clearInterval(timer);await sql`DELETE FROM testify_mcp_pages WHERE job_id=${id} AND market=${market} AND EXISTS(SELECT 1 FROM testify_mcp_jobs WHERE id=${id} AND execution_version=${executionVersion??job.execution_version})`;}
}
export async function finishJob(id,errors,sql=database()) {
  const job=await loadJobRecord(id,sql);
  const [{count}]=await sql`SELECT count(*) FROM testify_run_summaries WHERE job_id=${id}`;
  const status=job.cancel_requested||job.revoked_at?"cancelled":errors.length?(Number(count)>0?"partial":"failed"):"completed";
  const progress=job.progress||{};if(status==="cancelled")for(const m of job.config.markets){progress.markets??={};if(!['completed','failed'].includes(progress.markets[m]?.status))progress.markets[m]={...progress.markets[m],status:'cancelled'};}
  await sql`UPDATE testify_mcp_jobs SET status=${status},errors=${JSON.stringify(errors)}::jsonb,progress=${JSON.stringify(progress)}::jsonb,progress_revision=progress_revision+1,updated_at=now() WHERE id=${id}`;
  await sql`DELETE FROM testify_mcp_pages WHERE job_id=${id} OR expires_at<now()`;
  return {status};
}
