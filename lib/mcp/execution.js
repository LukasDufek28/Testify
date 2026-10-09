import { database, AuthError } from "../auth.js";
import { runServerBacktest } from "../server-execution.js";
import { parseStrategy } from "../shared/types.js";
import { validateData } from "../shared/data-validation.js";
import { summarizeRun } from "./summaries.js";
import { reserveBudget } from "./jobs.js";
const activeStates = ['queued','loading','running','waiting_retry'];
export async function loadJobRecord(id,sql=database()) {
  const [job]=await sql`SELECT j.*,g.revoked_at FROM testify_mcp_jobs j LEFT JOIN testify_mcp_grants g ON g.id=j.grant_id WHERE j.id=${id}`;
  if (!job) throw new Error("Job not found.");
  return job;
}
export const cancelled = job => job.cancel_requested || job.revoked_at || !activeStates.includes(job.status);
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
export async function reserveProviderSlot(sql=database()) {
  const now=Date.now();
  const [row]=await sql`INSERT INTO testify_mcp_budgets(key,value) VALUES ('coinbase-slot',${now}) ON CONFLICT(key) DO UPDATE SET value=greatest(${now},testify_mcp_budgets.value+500) RETURNING value`;
  return Math.max(0,Number(row.value)-now);
}
export async function fetchPage(id,market,cursor,sql=database(),request=fetch) {
  const job=await loadJobRecord(id,sql);
  if (cancelled(job)) return {cancelled:true};
  const config=job.config,plan=pagePlan(config,market),to=Math.min(plan.end,cursor+299*plan.interval);
  const existing=await sql`SELECT cursor FROM testify_mcp_pages WHERE job_id=${id} AND market=${market} AND cursor=${cursor} AND expires_at>now()`;
  if (existing.length) return {next:to};
  const month=new Date().toISOString().slice(0,7);
  await reserveBudget(sql,`pages:${month}`,Number(process.env.MCP_MONTHLY_PAGE_LIMIT || 5000));
  await reserveBudget(sql,`events:${month}`,Number(process.env.MCP_MONTHLY_EVENT_BUDGET || 40000),30);
  const query=new URLSearchParams({granularity:String(plan.interval),start:new Date(cursor*1000).toISOString(),end:new Date(to*1000).toISOString()});
  let response;
  try {response=await request(`https://api.exchange.coinbase.com/products/${market.toLowerCase()}/candles?${query}`,{headers:{Accept:"application/json","User-Agent":"Testify/1.0"},signal:AbortSignal.timeout(12000)});}
  catch {await setProgress(sql,id,"waiting_retry",{market,cursor,reason:"Market-data connection interrupted"});return {retryAfter:60};}
  if (response.status===429||response.status>=500) {
    const header=response.headers.get("Retry-After");
    const seconds=/^\d+$/.test(header||"")?Number(header):header?Math.ceil((Date.parse(header)-Date.now())/1000):60;
    const wait=Math.max(60,Number.isFinite(seconds)?seconds:60);
    await setProgress(sql,id,"waiting_retry",{market,cursor,reason:`Provider HTTP ${response.status}`,retryAfter:wait});
    await sql`INSERT INTO testify_mcp_budgets(key,value) VALUES ('coinbase-slot',${Date.now()+wait*1000}) ON CONFLICT(key) DO UPDATE SET value=greatest(testify_mcp_budgets.value,EXCLUDED.value)`;
    return {retryAfter:wait};
  }
  if (!response.ok) throw new Error(`Coinbase market data request failed (${response.status}).`);
  const bars=normalizeCandles(await response.json(),cursor,to).filter(b=>b.time%plan.interval===0);
  const payload=JSON.stringify(bars);
  // A small, temporary checkpoint budget; candle pages are never permanent history.
  const [size]=await sql`SELECT coalesce(sum(octet_length(payload::text)),0) AS bytes FROM testify_mcp_pages WHERE expires_at>now()`;
  const max=Number(process.env.MCP_TEMP_STORAGE_BYTES || 25000000);
  if (Number(size.bytes)+Buffer.byteLength(payload)>max) throw new AuthError("Temporary candle storage budget reached. Try fewer simultaneous markets or a larger timeframe.",429);
  if (cancelled(await loadJobRecord(id,sql))) return {cancelled:true};
  await sql`INSERT INTO testify_mcp_pages(job_id,market,cursor,payload,expires_at) VALUES (${id},${market},${cursor},${payload}::jsonb,now()+interval '24 hours') ON CONFLICT(job_id,market,cursor) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at`;
  await setProgress(sql,id,"loading",{market,cursor:to,end:plan.end});
  return {next:to};
}
export async function setProgress(sql,id,status,progress) {
  await sql`UPDATE testify_mcp_jobs SET status=${status},progress=${JSON.stringify(progress)}::jsonb,updated_at=now() WHERE id=${id} AND status IN ('queued','loading','running','waiting_retry')`;
}
export async function executeMarket(id,market,sql=database()) {
  const job=await loadJobRecord(id,sql);
  if (cancelled(job)) return {cancelled:true};
  const config=job.config,runId=`${id}-${market}`;
  const existing=await sql`SELECT id FROM testify_run_summaries WHERE user_id=${job.user_id} AND id=${runId}`;
  if (existing.length) return {runId};
  const pages=await sql`SELECT payload FROM testify_mcp_pages WHERE job_id=${id} AND market=${market} AND expires_at>now() ORDER BY cursor`;
  const expectedPlan=pagePlan(config,market);
  if(pages.length!==Math.ceil((expectedPlan.end-expectedPlan.start)/(299*expectedPlan.interval))) throw new Error("Temporary candle checkpoints expired or are incomplete. Resubmit the original period; it has not been shortened.");
  const base=[...new Map(pages.flatMap(p=>p.payload).map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);
  const plan=pagePlan(config,market),bars=aggregateCandles(base,config.granularity,plan.interval);
  const coverage=validateData(bars,config.settings.start,config.settings.end,config.granularity);
  if (coverage.received<20) throw new Error("At least 20 evaluation candles are required; check coverage or listing dates.");
  await setProgress(sql,id,"running",{market,candles:bars.length,coverage});
  const controller=new AbortController();
  const timer=setInterval(()=>{void loadJobRecord(id,sql).then(j=>{if(cancelled(j)) controller.abort();}).catch(()=>controller.abort());},1000);
  try {
    const run=await runServerBacktest({id:"mcp",symbol:market,fileName:`Coinbase · ${config.granularity/60}m`,bars,importedAt:Date.now(),skipped:0},parseStrategy(config.strategySource),config.settings,config.strategyId,config.name,controller.signal);
    if (cancelled(await loadJobRecord(id,sql))) return {cancelled:true};
    Object.assign(run,{id:runId,granularity:config.granularity,strategySource:config.strategySource,strategyRevision:config.strategyRevision,engineVersion:config.engineVersion,research:config.research,coverage});
    if (coverage.missing) run.warnings.push(`${coverage.missing} candles missing; ${coverage.coveragePct.toFixed(2)}% coverage. Requested period was not shortened.`);
    const summary=summarizeRun(run);
    await sql`INSERT INTO testify_run_summaries(user_id,id,job_id,payload) VALUES (${job.user_id},${runId},${id},${JSON.stringify(summary)}::jsonb) ON CONFLICT(user_id,id) DO NOTHING`;
    return {runId};
  } finally {clearInterval(timer);await sql`DELETE FROM testify_mcp_pages WHERE job_id=${id} AND market=${market}`;}
}
export async function finishJob(id,errors,sql=database()) {
  const job=await loadJobRecord(id,sql);
  const [{count}]=await sql`SELECT count(*) FROM testify_run_summaries WHERE job_id=${id}`;
  const status=job.cancel_requested||job.revoked_at?"cancelled":errors.length?(Number(count)>0?"partial":"failed"):"completed";
  await sql`UPDATE testify_mcp_jobs SET status=${status},errors=${JSON.stringify(errors)}::jsonb,updated_at=now() WHERE id=${id}`;
  await sql`DELETE FROM testify_mcp_pages WHERE job_id=${id} OR expires_at<now()`;
  return {status};
}
