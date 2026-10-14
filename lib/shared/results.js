import { parseStrategy } from "./types.js";
const rulesCache = /* @__PURE__ */ new WeakMap();
function savedRules(run) {
  const cached = rulesCache.get(run);
  if (cached && cached.source === run.strategySource) return cached.rules;
  let rules = null;
  try {
    const parsed = run.strategySource ? parseStrategy(run.strategySource) : null;
    rules = parsed?.version === 3 ? null : parsed;
  } catch {
  }
  rulesCache.set(run, { source: run.strategySource, rules });
  return rules;
}
function tradeR(run, trade) {
  if (Number.isFinite(trade.rMultiple)) return trade.rMultiple;
  const rules = savedRules(run);
  const riskPct = rules ? rules.allocationPct * rules.stopLossPct / 100 : 0;
  return riskPct > 0 ? trade.returnPct / riskPct : null;
}
function resultMetrics(run) {
  const profit = run.trades.reduce((sum, t) => sum + Math.max(0, t.pnl), 0);
  const loss = run.trades.reduce((sum, t) => sum + Math.max(0, -t.pnl), 0);
  const multiples = run.trades.map((t) => tradeR(run, t)).filter((r) => r !== null && Number.isFinite(r));
  return { netProfit: run.settings.capital * run.metrics.netReturnPct / 100, profitFactor: loss > 0 ? profit / loss : profit > 0 ? Infinity : null, averageR: multiples.length ? multiples.reduce((a, b) => a + b, 0) / multiples.length : null };
}
function drawdownCurve(run) {
  let peak = run.settings.capital;
  return run.curve.map((point) => {
    peak = Math.max(peak, point.equity);
    return { time: point.time, equity: peak > 0 ? (point.equity / peak - 1) * 100 : 0 };
  });
}
function monthlyReturns(run) {
  const months = /* @__PURE__ */ new Map();
  for (const point of run.curve) months.set(new Date(point.time * 1e3).toISOString().slice(0, 7), point.equity);
  let previous = run.settings.capital;
  return [...months].map(([month, equity]) => {
    const value = previous > 0 ? (equity / previous - 1) * 100 : 0;
    previous = equity;
    return { month, value };
  });
}
function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
function csvRows(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
function tradesCsv(run) {
  return csvRows([["Run", "Strategy", "Market", "Entry UTC", "Exit UTC", "Side", "Entry price", "Exit price", "Net P/L", "Return %", "R", "Exit reason"], ...run.trades.map((t) => [run.name, run.strategyName, run.symbol, new Date(t.entryTime * 1e3).toISOString(), new Date(t.exitTime * 1e3).toISOString(), t.side === 1 ? "Long" : "Short", t.entry, t.exit, t.pnl, t.returnPct, tradeR(run, t), t.reason])]);
}
function comparisonCsv(runs) {
  return csvRows([["Run", "Strategy", "Market", "Timeframe seconds", "Start UTC", "End UTC", "Starting capital", "Fee bps", "Slippage bps", "Fixed fee per round trip", "Spread bps", "Risk % equity", "Return %", "Max drawdown %", "Win rate %", "Trades", "Profit factor", "Average R"], ...runs.map((run) => {
    const m = resultMetrics(run);
    return [run.name, run.strategyName, run.symbol, run.granularity, new Date(run.settings.start * 1e3).toISOString(), new Date(run.settings.end * 1e3).toISOString(), run.settings.capital, run.settings.feeBps, run.settings.slippageBps, run.settings.feePerTrade, run.settings.spreadBps ?? 0, run.settings.riskPct ?? 0, run.metrics.netReturnPct, run.metrics.maxDrawdownPct, run.metrics.winRatePct, run.metrics.tradeCount, m.profitFactor, m.averageR];
  })]);
}
function sampleCurve(points, limit = 1800) {
  if (points.length <= limit) return points;
  const size = Math.ceil((points.length - 2) / Math.max(1, Math.floor((limit - 2) / 2)));
  const sampled = [points[0]];
  for (let start = 1; start < points.length - 1; start += size) {
    const end = Math.min(points.length - 1, start + size);
    let low = start, high = start;
    for (let i = start + 1; i < end; i++) {
      if (points[i].equity < points[low].equity) low = i;
      if (points[i].equity > points[high].equity) high = i;
    }
    sampled.push(points[Math.min(low, high)]);
    if (low !== high) sampled.push(points[Math.max(low, high)]);
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}
export {
  comparisonCsv,
  csvCell,
  csvRows,
  drawdownCurve,
  monthlyReturns,
  resultMetrics,
  sampleCurve,
  savedRules,
  tradeR,
  tradesCsv
};
