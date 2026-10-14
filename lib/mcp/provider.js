export async function reserveProviderSlot(sql) {
  const now=Date.now(),spacing=Math.ceil(1000/Math.min(3,Math.max(1,Number(process.env.MCP_PROVIDER_RPS)||3)));
  const [row]=await sql`INSERT INTO testify_mcp_budgets(key,value) VALUES ('coinbase-slot',${now+spacing}) ON CONFLICT(key) DO UPDATE SET value=${now+spacing} WHERE testify_mcp_budgets.value<=${now} RETURNING value`;
  if(row)return 0;
  const [pending]=await sql`SELECT value FROM testify_mcp_budgets WHERE key='coinbase-slot'`;
  return Math.max(1,Number(pending.value)-now);
}
export async function providerCooldown(sql,response) {
  const header=response.headers.get("Retry-After");
  const seconds=/^\d+$/.test(header||"")?Number(header):header?Math.ceil((Date.parse(header)-Date.now())/1000):60;
  const wait=Math.max(60,Number.isFinite(seconds)?seconds:60);
  await sql`INSERT INTO testify_mcp_budgets(key,value) VALUES ('coinbase-slot',${Date.now()+wait*1000}) ON CONFLICT(key) DO UPDATE SET value=greatest(testify_mcp_budgets.value,EXCLUDED.value)`;
  return wait;
}
export async function awaitHttpSlot(sql) {
  const deadline=Date.now()+3000;
  let wait=await reserveProviderSlot(sql);
  while(wait>0&&wait<2000&&Date.now()+wait<deadline){await new Promise(r=>setTimeout(r,wait));wait=await reserveProviderSlot(sql);}
  if(wait>0){const error=new Error("Coinbase request queue is busy; retry after the shared cooldown.");error.status=429;error.retryAfter=Math.max(1,Math.ceil(wait/1000));throw error;}
}
