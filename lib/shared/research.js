import { combinePortfolio } from "./portfolio.js";
function summarizeDevelopmentPortfolio(runs) {
  if (!runs.length || runs.some((run) => run.research?.phase !== "development" || !(run.settings.capital > 0) || !run.curve.length)) throw new Error("Select development backtests with equity curves for portfolio context.");
  const portfolio = combinePortfolio(runs);
  let profits = 0, losses = 0, wins = 0, trades = 0, fees = 0, funding = 0, rSum = 0, rCount = 0;
  const reasons = {};
  for (const run of runs) {
    const scale = portfolio.capital / run.settings.capital;
    fees += run.metrics.totalFees * scale;
    funding += (run.metrics.totalFunding ?? 0) * scale;
    for (const trade of run.trades) {
      const pnl = trade.pnl * scale;
      profits += Math.max(0, pnl);
      losses += Math.max(0, -pnl);
      wins += Number(pnl > 0);
      trades++;
      if (Number.isFinite(trade.rMultiple)) {
        rSum += trade.rMultiple;
        rCount++;
      }
      reasons[trade.reason] = (reasons[trade.reason] ?? 0) + 1;
    }
  }
  const markets = /* @__PURE__ */ new Map();
  for (const run of runs) markets.set(run.symbol, (markets.get(run.symbol) ?? 0) + run.metrics.netReturnPct);
  const ranked = [...markets].sort((a, b) => b[1] - a[1]);
  const daily = /* @__PURE__ */ new Map();
  for (const point of portfolio.curve) daily.set(Math.floor(point.time / 86400), point.equity);
  const dailyReturns = [];
  let previous = portfolio.capital, lastDay;
  let validSharpe = true;
  for (const [day, equity] of daily) {
    if (lastDay !== void 0 && day !== lastDay + 1) validSharpe = false;
    if (previous <= 0 || equity <= 0) validSharpe = false;
    if (lastDay !== void 0 && previous > 0) dailyReturns.push(equity / previous - 1);
    previous = equity;
    lastDay = day;
  }
  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / (dailyReturns.length || 1);
  const variance = dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (dailyReturns.length || 1);
  return {
    phase: "development",
    kind: "portfolio",
    runCount: runs.length,
    marketCount: markets.size,
    accounting: "Summed full-capital sleeve returns, matching Portfolio lab. Each run independently deploys one full capital allocation; this is not a shared-cash funded portfolio. Monetary statistics are normalized to reference capital. Partial exits count as trade legs. Overlapping or repeated runs are separate sleeves.",
    referenceCapital: portfolio.capital,
    effectiveSleeveCapital: portfolio.capital * runs.length,
    start: Math.min(...runs.map((run) => run.settings.start)),
    end: Math.max(...runs.map((run) => run.settings.end)),
    mixedPeriods: new Set(runs.map((run) => `${run.settings.start}:${run.settings.end}`)).size > 1,
    timeframeSeconds: [...new Set(runs.map((run) => run.granularity ?? 0))].slice(0, 20),
    netReturnPct: portfolio.returnPct,
    netProfit: portfolio.capital * portfolio.returnPct / 100,
    maxDrawdownPct: portfolio.maxDrawdownPct,
    sharpe: validSharpe && dailyReturns.length >= 20 && variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(365) : null,
    sharpeMethod: "Daily combined equity returns, annualized with 365 days; unavailable for sparse days, nonpositive equity or fewer than 20 observations.",
    tradeCount: trades,
    winRatePct: trades ? wins / trades * 100 : 0,
    profitFactor: losses > 0 ? profits / losses : null,
    averageTradePnl: trades ? (profits - losses) / trades : 0,
    averageRMultiple: rCount ? rSum / rCount : null,
    rMultipleTradeCount: rCount,
    totalFees: fees,
    totalFunding: funding,
    feeBpsRange: [Math.min(...runs.map((run) => run.settings.feeBps)), Math.max(...runs.map((run) => run.settings.feeBps))],
    slippageBpsRange: [Math.min(...runs.map((run) => run.settings.slippageBps)), Math.max(...runs.map((run) => run.settings.slippageBps))],
    costNotes: "Fees and slippage are already included in net results. Slippage is embedded in execution prices. Funding is included only where supplied; zero does not establish funding-data availability.",
    exitReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([reason, count]) => [reason.slice(0, 100), count]),
    bestMarkets: ranked.slice(0, 5).map(([symbol, netReturnPct]) => ({ symbol: symbol.slice(0, 40), netReturnPct })),
    worstMarkets: ranked.slice(-5).reverse().map(([symbol, netReturnPct]) => ({ symbol: symbol.slice(0, 40), netReturnPct }))
  };
}
function researchWindow(start, end, splitPct) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !Number.isFinite(splitPct) || splitPct <= 0 || splitPct >= 100) throw new Error("Choose a valid research period and development share.");
  const boundary = Math.floor(start + (end - start) * splitPct / 100);
  if (boundary <= start || boundary >= end) throw new Error("The selected research period is too short to split.");
  return { fullStart: start, fullEnd: end, boundary, splitPct };
}
function sameResearchWindow(a, b) {
  return !!a.research && !!b.research && a.research.fullStart === b.research.fullStart && a.research.fullEnd === b.research.fullEnd && a.research.boundary === b.research.boundary && a.research.splitPct === b.research.splitPct;
}
function summarizeDevelopmentRun(run) {
  if (run.research?.phase !== "development") throw new Error("Only development backtests can guide Gemini.");
  const trades = run.trades;
  const netTradePnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const averageTradePnl = trades.length ? netTradePnl / trades.length : 0;
  const lossCount = trades.filter((trade) => trade.pnl < 0).length;
  const reasons = Object.entries(trades.reduce((counts, trade) => {
    counts[trade.reason] = (counts[trade.reason] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { phase: "development", name: run.name.slice(0, 100), symbol: run.symbol, timeframeSeconds: run.granularity || 0, start: run.settings.start, end: run.settings.end, startingCapital: run.settings.capital, feeBps: run.settings.feeBps, slippageBps: run.settings.slippageBps, netReturnPct: run.metrics.netReturnPct, maxDrawdownPct: run.metrics.maxDrawdownPct, sharpe: run.metrics.sharpe, winRatePct: run.metrics.winRatePct, tradeCount: run.metrics.tradeCount, totalFees: run.metrics.totalFees, profitFactor: run.metrics.profitFactor, averageRMultiple: run.metrics.averageRMultiple, totalFunding: run.metrics.totalFunding, averageTradePnl, lossCount, exitReasons: reasons };
}
export {
  researchWindow,
  sameResearchWindow,
  summarizeDevelopmentPortfolio,
  summarizeDevelopmentRun
};
