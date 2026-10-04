import type { Run } from "./types";

export function researchWindow(start: number, end: number, splitPct: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !Number.isFinite(splitPct) || splitPct <= 0 || splitPct >= 100) throw new Error("Choose a valid research period and development share.");
  const boundary = Math.floor(start + (end - start) * splitPct / 100);
  if (boundary <= start || boundary >= end) throw new Error("The selected research period is too short to split.");
  return { fullStart: start, fullEnd: end, boundary, splitPct };
}

export function sameResearchWindow(a: Run, b: Run) {
  return !!a.research && !!b.research && a.research.fullStart === b.research.fullStart && a.research.fullEnd === b.research.fullEnd && a.research.boundary === b.research.boundary && a.research.splitPct === b.research.splitPct;
}

export function summarizeDevelopmentRun(run: Run) {
  if (run.research?.phase !== "development") throw new Error("Only development backtests can guide Gemini.");
  const trades = run.trades;
  const netTradePnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const averageTradePnl = trades.length ? netTradePnl / trades.length : 0;
  const lossCount = trades.filter((trade) => trade.pnl < 0).length;
  const reasons = Object.entries(trades.reduce<Record<string, number>>((counts, trade) => { counts[trade.reason] = (counts[trade.reason] || 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { phase: "development" as const, name: run.name.slice(0, 100), symbol: run.symbol, timeframeSeconds: run.granularity || 0, start: run.settings.start, end: run.settings.end, startingCapital: run.settings.capital, feeBps: run.settings.feeBps, slippageBps: run.settings.slippageBps, netReturnPct: run.metrics.netReturnPct, maxDrawdownPct: run.metrics.maxDrawdownPct, sharpe: run.metrics.sharpe, winRatePct: run.metrics.winRatePct, tradeCount: run.metrics.tradeCount, totalFees: run.metrics.totalFees, profitFactor: run.metrics.profitFactor, averageRMultiple: run.metrics.averageRMultiple, totalFunding: run.metrics.totalFunding, averageTradePnl, lossCount, exitReasons: reasons };
}
