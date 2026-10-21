const BASE = "https://api.exchange.coinbase.com";
export const GRANULARITIES = new Set([60, 300, 900, 1800, 3600, 14400, 21600, 86400]);

export async function coinbase(path) {
  let sql;
  if(process.env.DATABASE_URL&&process.env.AUTH_SECRET){
    const {database}=await import("./auth.js"),{awaitHttpSlot}=await import("./mcp/provider.js");sql=database();await awaitHttpSlot(sql);
  }
  const response = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json", "User-Agent": "Testify/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    const error = new Error(`Coinbase market data request failed (${response.status}).`);
    error.status = response.status;
    if(sql&&(response.status===429||response.status>=500)){const {providerCooldown}=await import("./mcp/provider.js");error.retryAfter=await providerCooldown(sql,response);}
    throw error;
  }
  return response.json();
}

export function validateRange(product, granularity, start, end) {
  if (!/^[A-Z0-9]{2,20}-(USD|USDT)$/.test(product)) throw new Error("Choose a USD or USDT crypto market.");
  if (!GRANULARITIES.has(granularity)) throw new Error("Choose a supported candle interval.");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end > Date.now() / 1000 + 60) throw new Error("Choose a valid historical date range.");
}

export async function getCandles(product, granularity, start, end) {
  validateRange(product, granularity, start, end);
  if (granularity === 14400 || granularity === 1800) {
    // Aggregate complete UTC-aligned groups only.
    const baseInterval = granularity === 1800 ? 900 : 3600;
    const groupSize = granularity / baseInterval;
    const alignedStart = Math.ceil(start / granularity) * granularity;
    const alignedEnd = Math.floor(Math.min(end, Date.now() / 1000) / granularity) * granularity;
    if (alignedStart >= alignedEnd) return [];
    const hourly = await getCandles(product, baseInterval, alignedStart, alignedEnd);
    const groups = new Map();
    for (const bar of hourly) { const time = Math.floor(bar.time / granularity) * granularity; const group = groups.get(time) || []; group.push(bar); groups.set(time, group); }
    return [...groups.entries()].filter(([time, group]) => group.length === groupSize && group.every((bar, i) => bar.time === time + i * baseInterval)).map(([time, group]) => ({ time, open: group[0].open, high: Math.max(...group.map((b) => b.high)), low: Math.min(...group.map((b) => b.low)), close: group[groupSize - 1].close, volume: group.reduce((sum, b) => sum + b.volume, 0), spread: 0 }));
  }
  const results = [];
  for (let cursor = start; cursor < end; cursor += granularity * 299) {
    if (results.length) await new Promise((resolve) => setTimeout(resolve, 500));
    const to = Math.min(end, cursor + granularity * 299);
    const query = new URLSearchParams({ granularity: String(granularity), start: new Date(cursor * 1000).toISOString(), end: new Date(to * 1000).toISOString() });
    results.push(await coinbase(`/products/${product.toLowerCase()}/candles?${query}`));
  }
  const byTime = new Map();
  for (const rows of results) {
    if (!Array.isArray(rows)) throw new Error("Coinbase returned invalid candle data.");
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [time, low, high, open, close, volume] = row.map(Number);
      if (time < start || time >= end || ![time, low, high, open, close, volume].every(Number.isFinite) || low <= 0 || high < low || open < low || open > high || close < low || close > high) continue;
      byTime.set(time, { time, open, high, low, close, volume, spread: 0 });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
