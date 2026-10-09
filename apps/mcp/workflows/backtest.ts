import { sleep } from "workflow";
async function readJob(id: string) {
  "use step";
  const { loadJobRecord,cancelled }=await import("../../../lib/mcp/execution.js");
  const job=await loadJobRecord(id);
  return {config:job.config,cancelled:!!cancelled(job),concurrency:Math.min(4,Math.max(1,Math.floor(Number(process.env.MCP_MARKET_CONCURRENCY)||3)))};
}
async function loadChunk(id:string,market:string,cursor:number) {
  "use step";
  const {loadJobRecord,cancelled,pagePlan,fetchPage}=await import("../../../lib/mcp/execution.js");
  const {reserveBudget}=await import("../../../lib/mcp/jobs.js");
  const {database}=await import("../../../lib/auth.js");
  const sql=database(),job=await loadJobRecord(id,sql),plan=pagePlan(job.config,market);
  if(cancelled(job))return {cancelled:true,cursor};
  await reserveBudget(sql,`events:${new Date().toISOString().slice(0,7)}`,Number(process.env.MCP_MONTHLY_EVENT_BUDGET||40000),20);
  const deadline=Date.now()+15000;
  for(let i=0;i<6&&cursor<plan.end&&Date.now()<deadline;i++){
    const result=await fetchPage(id,market,cursor,sql);
    if(result.cancelled)return {cancelled:true,cursor};
    if(result.retryAfter)return {cursor,retryAfter:result.retryAfter};
    if(result.rateWait)return {cursor,rateWait:result.rateWait};
    cursor=result.next!;
  }
  return {cursor,done:cursor>=plan.end};
}
async function execute(id:string,market:string) {
  "use step";
  const {executeMarket}=await import("../../../lib/mcp/execution.js");return executeMarket(id,market);
}
async function failed(id:string,market:string,error:string) {
  "use step";
  const {marketProgress}=await import("../../../lib/mcp/execution.js");
  const {database}=await import("../../../lib/auth.js");await marketProgress(database(),id,market,"failed",{error});
}
async function finish(id:string,errors:{market:string;error:string}[]) {
  "use step";
  const {finishJob}=await import("../../../lib/mcp/execution.js");return finishJob(id,errors);
}
export async function backtestWorkflow(id:string) {
  "use workflow";
  const initial=await readJob(id),errors:{market:string;error:string}[]=[];
  if(initial.cancelled)return finish(id,errors);
  const lanes=Array.from({length:Math.min(initial.concurrency,initial.config.markets.length)},(_,lane)=>initial.config.markets.filter((_:string,i:number)=>i%initial.concurrency===lane));
  await Promise.all(lanes.map(async markets=>{
    for(const market of markets){
      const c=initial.config;let cursor=Math.ceil((c.settings.warmupStart??c.settings.start)/c.granularity)*c.granularity,retries=0;
      try{
        while(true){
          const result=await loadChunk(id,market,cursor);cursor=result.cursor;
          if(result.cancelled)return;
          if(result.retryAfter){if(++retries>10)throw new Error("Market provider remained unavailable after ten retries.");await sleep(result.retryAfter*1000);continue;}
          if(result.rateWait){await sleep(result.rateWait);continue;}
          retries=0;if(result.done)break;
        }
        const result=await execute(id,market);if(result.cancelled)return;
      }catch(e){const error=e instanceof Error?e.message:String(e);errors.push({market,error});await failed(id,market,error);}
    }
  }));
  return finish(id,errors);
}
