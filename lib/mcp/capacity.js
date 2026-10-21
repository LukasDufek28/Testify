import { AuthError } from "../auth.js";
export const resources={jobs:{env:"MCP_MONTHLY_JOB_LIMIT",fallback:100},pages:{env:"MCP_MONTHLY_PAGE_LIMIT",fallback:5000},events:{env:"MCP_MONTHLY_EVENT_BUDGET",fallback:40000}};
export const nextMonth=(now=new Date())=>new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
export class BudgetError extends AuthError {
  constructor(resource,limit,used){super(`Configured ${resource} budget is temporarily exhausted. This is an internal resource guard, not a Testify subscription or payment requirement.`,429);this.code="CONFIGURED_BUDGET_EXHAUSTED";this.resource=resource;this.limit=limit;this.used=used;this.retryAt=nextMonth();}
}
export function errorDetails(error) {
  const status=error instanceof AuthError?error.status:error?.status===429?429:503;
  const code=error.code || (status===429?"REQUEST_RATE_LIMIT":status===401?"AUTH_REQUIRED":status===409?"CONFLICT":"ACTION_FAILED");
  const retryable=error instanceof BudgetError||status===429||status===503;
  const retryAfterSeconds=error instanceof BudgetError?Math.max(1,Math.ceil((Date.parse(error.retryAt)-Date.now())/1000)):status===429?(error.retryAfter||60):status===503?30:undefined;
  return {error:error instanceof AuthError||status===429?error.message:"The action could not complete. Check Testify activity and retry safely.",status,code,retryable,paymentRequired:false,retryAt:error.retryAt||(retryAfterSeconds?new Date(Date.now()+retryAfterSeconds*1000).toISOString():undefined),retryAfterSeconds,resource:error.resource,used:error.used,limit:error.limit,existingJobId:error.existingJobId,nextAction:error instanceof BudgetError?"Wait until retryAt, then retry with the same idempotency key. Existing paused jobs resume automatically. Do not recommend payment or another platform based on this response.":status===429?"Wait retryAfterSeconds, then retry the same tool arguments and idempotency key. Existing background jobs keep running; use wait_for_job to monitor them.":error.existingJobId?"Monitor the existing job with wait_for_job instead of submitting a duplicate batch.":"Correct the reported issue before retrying; do not infer a paid tier from this error."};
}
export async function getCapacity(sql) {
  const month=new Date().toISOString().slice(0,7),rows=await sql`SELECT key,value FROM testify_mcp_budgets WHERE key IN (${`jobs:${month}`},${`pages:${month}`},${`events:${month}`})`;
  return {paymentRequired:false,budgetType:"Owner-configured application guards; events are estimates, not measured Vercel billing or a subscription quota.",resetsAt:nextMonth(),resources:Object.entries(resources).map(([resource,c])=>{const limit=Number(process.env[c.env]||c.fallback),used=Number(rows.find(r=>r.key===`${resource}:${month}`)?.value||0);return {resource,used,limit,remaining:Math.max(0,limit-used)};}),guidance:"For provider throttling, wait and retry automatically. Never infer payment is needed. For interrupted jobs use resume_job; inspect capacity before large batches. Respect development/validation/holdout boundaries and do not switch engines without the user requesting it."};
}
