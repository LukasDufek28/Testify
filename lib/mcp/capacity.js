import { AuthError } from "../auth.js";
export function usageQuery(sql,resource,amount=1) {
  if(!['jobs','pages','events'].includes(resource)||!Number.isSafeInteger(amount)||amount<1)throw new Error('Invalid usage counter.');
  const key=`${resource}:${new Date().toISOString().slice(0,7)}`;
  return sql`INSERT INTO testify_mcp_budgets(key,value) VALUES (${key},${amount}) ON CONFLICT(key) DO UPDATE SET value=testify_mcp_budgets.value+EXCLUDED.value`;
}
export const recordUsage=(sql,resource,amount=1)=>usageQuery(sql,resource,amount);
export function errorDetails(error) {
  const status=error instanceof AuthError?error.status:error?.status===429?429:503;
  const code=error.code || (status===429?"REQUEST_RATE_LIMIT":status===401?"AUTH_REQUIRED":status===409?"CONFLICT":"ACTION_FAILED");
  const retryable=status===429||status===503;
  const retryAfterSeconds=status===429?(error.retryAfter||60):status===503?30:undefined;
  return {error:error instanceof AuthError||status===429?error.message:"The action could not complete. Check Testify activity and retry safely.",status,code,retryable,paymentRequired:false,retryAt:error.retryAt||(retryAfterSeconds?new Date(Date.now()+retryAfterSeconds*1000).toISOString():undefined),retryAfterSeconds,existingJobId:error.existingJobId,nextAction:error.code==='JOB_REQUIRES_RESUME'?"Call resume_job with existingJobId to release the obsolete monthly-budget pause.":status===429?"Wait retryAfterSeconds, then retry the same tool arguments and idempotency key. Existing background jobs keep running; use wait_for_job to monitor them.":error.existingJobId?"Monitor the existing job with wait_for_job instead of submitting a duplicate batch.":"Correct the reported issue before retrying; do not infer a paid tier from this error."};
}
export async function getCapacity(sql) {
  const month=new Date().toISOString().slice(0,7),rows=await sql`SELECT key,value FROM testify_mcp_budgets WHERE key IN (${`jobs:${month}`},${`pages:${month}`},${`events:${month}`})`;
  return {paymentRequired:false,monthlyCapsEnforced:false,period:month,budgetType:"Usage reporting only. Counters do not block submissions or pause execution.",resources:['jobs','pages','events'].map(resource=>({resource,used:Number(rows.find(r=>r.key===`${resource}:${month}`)?.value||0),limit:null,remaining:null,enforced:false,measurement:resource==='events'?'estimated workflow events; not measured hosting usage':'recorded application count'})),hostingUsage:{available:false,source:"Vercel dashboard/usage API",note:"Actual compute, queue, workflow and database allowances are enforced by their providers. These application counters are not a hosting bill. No paid plan upgrades are performed."},controls:{providerRequestsPerSecond:Math.min(3,Math.max(1,Number(process.env.MCP_PROVIDER_RPS)||3)),parallelMarkets:Math.min(4,Math.max(1,Math.floor(Number(process.env.MCP_MARKET_CONCURRENCY)||3))),temporaryStorageBytes:Number(process.env.MCP_TEMP_STORAGE_BYTES||25000000),candleCacheBytes:Number(process.env.MCP_CANDLE_CACHE_BYTES||25000000)},guidance:"There is no monthly Testify job, candle-request or estimated-event quota. Provider throttling waits and retries. Use resume_job for interrupted batches, including old monthly-budget pauses. Respect research boundaries. Do not infer a paid plan, unlimited hosting, or measured billing from usage counters."};
}
