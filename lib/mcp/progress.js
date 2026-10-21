import { AuthError } from "../auth.js";
export function compactProgress(job) {
  const granularity=job.config.granularity,interval=granularity===1800?900:granularity===14400?3600:granularity;
  const start=Math.ceil((job.config.settings.warmupStart??job.config.settings.start)/granularity)*granularity,end=Math.floor(job.config.settings.end/granularity)*granularity;
  const markets=job.config.markets.map(m=>({symbol:m,status:"queued",requestedSlots:Math.max(0,(end-start)/interval),...job.progress?.markets?.[m]}));
  if(job.status==='cancelled')for(const market of markets)if(!['completed','failed'].includes(market.status))market.status='cancelled';
  const count=state=>markets.filter(m=>state.includes(m.status)).length;
  const completed=count(["completed"]),failed=count(["failed"]),running=count(["running"]),loading=count(["loading"]),waiting=count(["waiting_retry"]),queued=count(["queued"]),cancelled=count(["cancelled"]);
  const total=markets.length,loaded=markets.reduce((n,m)=>n+(m.loadedSlots||0),0),requested=markets.reduce((n,m)=>n+m.requestedSlots,0);
  const fraction=markets.reduce((n,m)=>n+(["completed","failed","cancelled"].includes(m.status)?1:m.status==="running"?.95:.9*Math.min(1,(m.loadedSlots||0)/Math.max(1,m.requestedSlots))),0)/Math.max(1,total);
  const retryTimes=markets.filter(m=>m.status==="waiting_retry"&&Number.isFinite(m.retryAt)).map(m=>m.retryAt);
  return {jobId:job.id,status:job.status,revision:Number(job.progress_revision||0),summary:`${completed}/${total} completed, ${running} running, ${loading} loading, ${waiting} waiting, ${queued} queued${failed?`, ${failed} failed`:""}`,paymentRequired:false,retryAt:retryTimes.length?new Date(Math.min(...retryTimes)).toISOString():undefined,nextAction:waiting?"The server will resume automatically. Respect retryAt; do not submit a duplicate or infer a paid plan.":['failed','partial','cancelled'].includes(job.status)?"Use resume_job to continue the same frozen batch and skip successful markets.":"Use wait_for_job to wait for meaningful progress.",counts:{total,completed,running,loading,waiting,queued,failed,cancelled},progressPct:Math.round(fraction*1000)/10,progressBasis:"Loaded candle intervals (including reported gaps); execution has no reliable percentage. Stage-weighted estimate, not an ETA.",data:{loadedSlots:loaded,requestedSlots:requested,receivedCandles:markets.reduce((n,m)=>n+(m.receivedCandles||0),0),cachedPages:markets.reduce((n,m)=>n+(m.cachedPages||0),0),providerRequests:markets.reduce((n,m)=>n+(m.providerRequests||0),0)},markets,errors:job.errors,updatedAt:job.updated_at};
}
export async function getProgress(sql,userId,id) {
  const [job]=await sql`SELECT id,status,jsonb_build_object('markets',config->'markets','granularity',config->'granularity','settings',jsonb_build_object('start',config#>'{settings,start}','end',config#>'{settings,end}','warmupStart',config#>'{settings,warmupStart}')) AS config,progress,progress_revision,errors,updated_at FROM testify_mcp_jobs WHERE id=${id} AND user_id=${userId}`;
  if(!job)throw new AuthError("Job not found.",404);return compactProgress(job);
}
export async function waitForProgress(sql,userId,id,afterRevision,waitSeconds=45,signal,until="changed") {
  const deadline=Date.now()+Math.min(45,Math.max(0,waitSeconds))*1000;
  let result=await getProgress(sql,userId,id);const revision=afterRevision??result.revision;
  while((until==="completed"||result.revision<=revision)&&["queued","loading","running","waiting_retry"].includes(result.status)&&Date.now()<deadline&&!signal?.aborted){await new Promise(r=>setTimeout(r,Math.min(1000,deadline-Date.now())));result=await getProgress(sql,userId,id);}
  return {...result,changed:result.revision>revision,timedOut:result.revision<=revision&&Date.now()>=deadline};
}
