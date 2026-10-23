import { sleep } from "workflow";
async function readJob(id: string,version:number) {
  "use step";
  const { loadJobRecord,cancelled }=await import("../../../lib/mcp/execution.js");
  const job=await loadJobRecord(id);
  const sql=(await import("../../../lib/auth.js")).database();
  const completed=await sql`SELECT payload->>'symbol' AS symbol FROM testify_run_summaries WHERE job_id=${id} AND user_id=${job.user_id}`;
  return {config:job.config,completedMarkets:completed.map(r=>r.symbol),superseded:job.execution_version!==version,cancelled:!!cancelled(job),concurrency:Math.min(4,Math.max(1,Math.floor(Number(process.env.MCP_MARKET_CONCURRENCY)||3)))};
}
async function loadChunk(id:string,market:string,cursor:number,version:number):Promise<{cursor:number;cancelled?:boolean;retryAfter?:number;rateWait?:number;done?:boolean}> {
  "use step";
  const {loadMarketChunk}=await import("../../../lib/mcp/execution.js");return loadMarketChunk(id,market,cursor,version);
}
async function execute(id:string,market:string,version:number) {
  "use step";
  const {executeMarket}=await import("../../../lib/mcp/execution.js");const {database}=await import("../../../lib/auth.js");return executeMarket(id,market,database(),version);
}
async function failed(id:string,market:string,error:string,version:number) {
  "use step";
  const {marketProgress,loadJobRecord}=await import("../../../lib/mcp/execution.js");
  const {database}=await import("../../../lib/auth.js");const sql=database();if((await loadJobRecord(id,sql)).execution_version===version)await marketProgress(sql,id,market,"failed",{error});
}
async function finish(id:string,errors:{market:string;error:string}[],version:number) {
  "use step";
  const {finishJob,loadJobRecord}=await import("../../../lib/mcp/execution.js");if((await loadJobRecord(id)).execution_version!==version)return {status:"superseded"};return finishJob(id,errors);
}
export async function backtestWorkflow(id:string,version=0) {
  "use workflow";
  const initial=await readJob(id,version),errors:{market:string;error:string}[]=[];
  if(initial.superseded)return {status:"superseded"};
  if(initial.cancelled)return finish(id,errors,version);
  const lanes=Array.from({length:Math.min(initial.concurrency,initial.config.markets.length)},(_,lane)=>initial.config.markets.filter((_:string,i:number)=>i%initial.concurrency===lane));
  await Promise.all(lanes.map(async markets=>{
    for(const market of markets){
      if(initial.completedMarkets.includes(market))continue;
      const c=initial.config;let cursor=Math.ceil((c.settings.warmupStart??c.settings.start)/c.granularity)*c.granularity,retries=0;
      try{
        while(true){
          const result=await loadChunk(id,market,cursor,version);cursor=result.cursor;
          if(result.cancelled)return;
          if(result.retryAfter){await sleep(Math.max(result.retryAfter*1000,Math.min(600000,60000*2**Math.min(retries++,4))));cursor=Math.ceil((c.settings.warmupStart??c.settings.start)/c.granularity)*c.granularity;continue;}
          if(result.rateWait){await sleep(result.rateWait);continue;}
          retries=0;if(result.done)break;
        }
        const result=await execute(id,market,version);if(result.cancelled)return;
      }catch(e){const error=e instanceof Error?e.message:String(e);errors.push({market,error});await failed(id,market,error,version);}
    }
  }));
  return finish(id,errors,version);
}
