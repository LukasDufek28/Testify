import { gzipSync, gunzipSync } from "node:zlib";
export const PAGE_CANDLES = 299;
export function cacheWindow(cursor, interval, now = Date.now()) {
  const width=PAGE_CANDLES*interval, bucket=Math.floor(cursor/width)*width;
  return {bucket,end:Math.min(bucket+width,Math.floor(now/1000/interval)*interval)};
}
export async function readCache(sql,market,interval,bucket) {
  const [row]=await sql`UPDATE testify_candle_cache SET accessed_at=now() WHERE market=${market} AND interval_seconds=${interval} AND bucket=${bucket} RETURNING payload,complete,expires_at`;
  if(!row)return null;
  try{const value=JSON.parse(gunzipSync(Buffer.from(row.payload,"base64")).toString());return {bars:value.bars,coveredEnd:value.coveredEnd,complete:row.complete,fresh:new Date(row.expires_at).getTime()>Date.now()};}catch{return null;}
}
export async function cacheLease(sql,market,interval,bucket,owner) {
  const rows=await sql`INSERT INTO testify_candle_leases(market,interval_seconds,bucket,owner,expires_at) VALUES (${market},${interval},${bucket},${owner},now()+interval '30 seconds') ON CONFLICT(market,interval_seconds,bucket) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at WHERE testify_candle_leases.expires_at<now() OR testify_candle_leases.owner=EXCLUDED.owner RETURNING owner`;
  return !!rows.length;
}
export async function releaseCacheLease(sql,market,interval,bucket,owner) {
  await sql`DELETE FROM testify_candle_leases WHERE market=${market} AND interval_seconds=${interval} AND bucket=${bucket} AND owner=${owner}`;
}
export async function writeCache(sql,market,interval,bucket,bars,complete,coveredEnd) {
  const payload=gzipSync(JSON.stringify({bars,coveredEnd})).toString("base64"),bytes=Buffer.byteLength(payload);
  const max=Number(process.env.MCP_CANDLE_CACHE_BYTES || 25000000);
  if(!Number.isSafeInteger(max)||max<=0||bytes>max)return;
  // Serialize admissions and LRU eviction so concurrent accounts cannot exceed the cache budget.
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(7482941)`,
    sql`DELETE FROM testify_candle_cache WHERE expires_at<now() OR (market=${market} AND interval_seconds=${interval} AND bucket=${bucket})`,
    sql`DELETE FROM testify_candle_cache WHERE (market,interval_seconds,bucket) IN (SELECT market,interval_seconds,bucket FROM (SELECT market,interval_seconds,bucket,sum(octet_length(payload)) OVER(ORDER BY accessed_at DESC,market,interval_seconds,bucket) AS kept FROM testify_candle_cache) ranked WHERE kept>${max-bytes}::bigint)`,
    sql`INSERT INTO testify_candle_cache(market,interval_seconds,bucket,payload,complete,expires_at) VALUES (${market},${interval},${bucket},${payload},${complete},now()+(${complete?604800:300}::integer*interval '1 second'))`,
  ]);
}
export function missingRanges(bars,start,end,interval) {
  const times=new Set(bars.map(b=>b.time)),ranges=[];let from=null;
  for(let t=start;t<end;t+=interval){if(!times.has(t)){if(from===null)from=t;}else if(from!==null){ranges.push([from,t]);from=null;}}
  if(from!==null)ranges.push([from,end]);return ranges;
}
