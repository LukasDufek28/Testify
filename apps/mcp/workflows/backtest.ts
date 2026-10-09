import { sleep } from "workflow";
// Steps return IDs and progress only, so workflow persistence never contains candles or trade logs.
async function readJob(id: string) {
  "use step";
  const { loadJobRecord } = await import("../../../lib/mcp/execution.js");
  const job = await loadJobRecord(id);
  return { config: job.config, cancelled: !!job.cancel_requested || !!job.revoked_at || !["queued", "loading", "running", "waiting_retry"].includes(job.status) };
}
async function slot() {
  "use step";
  const { reserveProviderSlot } = await import("../../../lib/mcp/execution.js");
  return reserveProviderSlot();
}
async function page(id: string, market: string, cursor: number) {
  "use step";
  const { fetchPage } = await import("../../../lib/mcp/execution.js");
  return fetchPage(id, market, cursor);
}
async function execute(id: string, market: string) {
  "use step";
  const { executeMarket } = await import("../../../lib/mcp/execution.js");
  return executeMarket(id, market);
}
async function finish(id: string, errors: {market:string;error:string}[]) {
  "use step";
  const { finishJob } = await import("../../../lib/mcp/execution.js");
  return finishJob(id, errors);
}
export async function backtestWorkflow(id: string) {
  "use workflow";
  const initial = await readJob(id);
  const errors: {market:string;error:string}[] = [];
  if (!initial.cancelled) for (const market of initial.config.markets) {
    try {
      const config=initial.config;
      const interval=config.granularity===1800?900:config.granularity===14400?3600:config.granularity;
      let cursor=Math.ceil((config.settings.warmupStart ?? config.settings.start)/config.granularity)*config.granularity;
      const end=Math.floor(config.settings.end/config.granularity)*config.granularity;
      let retries=0;
      while(cursor<end) {
        if ((await readJob(id)).cancelled) break;
        const wait=await slot(); if(wait>0) await sleep(wait);
        const result=await page(id,market,cursor);
        if(result.cancelled) break;
        if(result.retryAfter) {if(++retries>10) throw new Error("Market provider remained unavailable after ten retries.");await sleep(result.retryAfter*1000);continue;}
        cursor=result.next!;retries=0;
      }
      if ((await readJob(id)).cancelled) break;
      await execute(id,market);
    } catch(error) {errors.push({market,error:error instanceof Error?error.message:String(error)});}
  }
  return finish(id,errors);
}
