import {adversePrice,validateExecutionOverrides} from "./execution-costs.js";
import { runBacktest } from "./engine.js";
import { createScriptRuntime, type EntryOrder, type ScriptPosition } from "./script-runtime.js";
import type { BacktestSettings, Bar, Dataset, EquityPoint, Run, ScriptStrategy, Strategy, Trade } from "./types";

type Position = ScriptPosition & { sideNumber: 1 | -1; equityAtEntry: number; entryFee: number; funding: number; initialUnits: number };

export async function runStrategyBacktest(dataset: Dataset, strategy: Strategy, settings: BacktestSettings, strategyId: string, name: string): Promise<Run> {
  if (strategy.version !== 3) return runBacktest(dataset, strategy, settings, strategyId, name);
  return runProgrammableBacktest(dataset, strategy, settings, strategyId, name);
}

async function runProgrammableBacktest(dataset: Dataset, strategy: ScriptStrategy, settings: BacktestSettings, strategyId: string, name: string, budgetMs = 120000): Promise<Run> {
  validateExecutionOverrides(settings);
  if (!Number.isFinite(settings.capital) || settings.capital <= 0 || !Number.isFinite(settings.feeBps) || settings.feeBps < 0 || !Number.isFinite(settings.slippageBps) || settings.slippageBps < 0 || !Number.isFinite(settings.start) || !Number.isFinite(settings.end) || settings.start >= settings.end) throw new Error("Invalid capital, dates or trading costs.");
  if (settings.feePerTrade !== undefined && (!Number.isFinite(settings.feePerTrade) || settings.feePerTrade < 0 || settings.feePerTrade > 1e9)) throw new Error("Fixed trade fee must be nonnegative and finite.");
  if (settings.warmupStart !== undefined && (!Number.isFinite(settings.warmupStart) || settings.warmupStart > settings.start)) throw new Error("Invalid warm-up start.");
  const bars = dataset.bars.filter((bar) => bar.time >= (settings.warmupStart ?? settings.start) && bar.time <= settings.end);
  if (bars.filter(b => b.time >= settings.start).length < 20) throw new Error("The selected evaluation date range needs at least 20 bars.");
  if (bars.some((b, i) => !Number.isFinite(b.time) || [b.open, b.high, b.low, b.close].some((v) => !Number.isFinite(v) || v <= 0) || !Number.isFinite(b.volume) || b.volume < 0 || b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close, b.high) || (i > 0 && b.time <= bars[i - 1].time))) throw new Error("Candles must contain valid OHLCV prices in chronological order without duplicates.");
  const intervals = bars.slice(1).map((b, i) => b.time - bars[i].time).sort((a, b) => a - b);
  const seconds = intervals[Math.floor(intervals.length / 2)];
  const funding = (dataset.funding || []).filter((f) => f.time >= bars[0].time && f.time < bars.at(-1)!.time + seconds).sort((a, b) => a.time - b.time);
  const barTimes = new Set(bars.map((b) => b.time));
  if (funding.some((f, i) => !Number.isFinite(f.rate) || !barTimes.has(f.time) || (f.markPrice !== undefined && (!Number.isFinite(f.markPrice) || f.markPrice <= 0)) || (i > 0 && f.time === funding[i - 1].time))) throw new Error("Funding events must be unique, finite and aligned to candle opens; import finer candles for other timestamps.");
  const vm = await createScriptRuntime(strategy);
  let position: Position | null = null, order: { entry: EntryOrder; submitted: number } | null = null;
  let pendingExit = 0, cash = settings.capital, totalFees = 0, totalFunding = 0, fundingIndex = 0;
  const curve: EquityPoint[] = [], trades: Trade[] = [];
  const warnings = ["Custom strategy sees only completed candles. Orders and stop updates become active on the following candle.", "One position per market; no leverage or pyramiding. Gross position notional is capped at current equity.", "OHLC candles cannot reveal intrabar order. Stops take priority when stop and target are both touched; entry-bar stop conflicts use the adverse outcome."];
  if (!funding.length) warnings.push("No historical funding data supplied; funding fees were not modeled. Short positions on spot candles are synthetic.");
  const warn = (message: string) => { if (!warnings.includes(message)) warnings.push(message); };
  const adverse = (price: number, side: 1 | -1, entering: boolean) => adversePrice(price,side,entering,settings);
  const close = (mid: number, bar: Bar, reason: string, pct = 100, atClose = false) => {
    if (!position) return;
    const p: Position = position;
    const fraction = pct / 100, units = p.units * fraction;
    const entryFee = p.entryFee * fraction, fundingCost = p.funding * fraction;
    const price = adverse(mid, p.sideNumber, false), fee = settings.feePerTrade !== undefined ? settings.feePerTrade / 2 * units / p.initialUnits : units * price * settings.feeBps / 10000;
    const gross = p.sideNumber * units * (price - p.entry);
    cash += gross - fee; totalFees += fee;
    const pnl = gross - fee - entryFee - fundingCost;
    trades.push({ entryTime: p.entryTime, exitTime: bar.time + (atClose ? seconds : 0), side: p.sideNumber, entry: p.entry, exit: price, pnl, returnPct: pnl / p.equityAtEntry * 100, reason, ...(p.initialRisk > 0 ? { rMultiple: pnl / (p.initialRisk * units / p.initialUnits) } : {}), funding: fundingCost, stopLoss:p.stopPrice, takeProfit:p.takeProfitPrice });
    if (pct === 100) position = null;
    else { p.units -= units; p.entryFee -= entryFee; p.funding -= fundingCost; }
  };
  const fill = (e: EntryOrder, mid: number, bar: Bar) => {
    const side: 1 | -1 = e.side === "long" ? 1 : -1;
    let price = adverse(mid, side, true);
    if (e.type === "limit") price = side === 1 ? Math.min(price, e.price!) : Math.max(price, e.price!);
    const stop = e.stopDistance !== undefined ? price - side * e.stopDistance : e.stopPrice ?? null;
    const take = e.takeProfitPrice ?? null;
    if (!Number.isFinite(price) || price <= 0 || (stop !== null && (stop <= 0 || side * (price - stop) <= 0)) || (take !== null && side * (take - price) <= 0)) { warn("An entry was skipped because a gap placed its initial stop or target on the wrong side of the actual fill."); return; }
    const equity = cash, distance = stop === null ? 0 : Math.abs(price - stop);
    // Leave room for the entry commission so notional plus fees cannot exceed equity.
    const cap = Math.max(0, equity - (settings.feePerTrade ?? 0) / 2) * (e.allocationPct ?? 100) / 100 / (price * (1 + (settings.feePerTrade !== undefined ? 0 : settings.feeBps / 10000)));
    const requestedRisk=settings.riskPct||e.riskPct;
    if(requestedRisk&&distance<=0)throw new Error("Risk-based sizing needs a positive initial stop distance.");
    const units = Math.min(cap, requestedRisk === undefined ? cap : equity * requestedRisk / 100 / distance);
    if (!Number.isFinite(units) || units <= 0) return;
    const fee = settings.feePerTrade !== undefined ? settings.feePerTrade / 2 : units * price * settings.feeBps / 10000;
    cash -= fee; totalFees += fee;
    position = { side: e.side, sideNumber: side, entry: price, entryTime: bar.time, units, initialUnits: units, equityAtEntry: equity, entryFee: fee, funding: 0, stopPrice: stop, takeProfitPrice: take, initialRisk: distance * units, highestHigh: price, lowestLow: price, barsHeld: 0 };
  };
  const deadline = Date.now() + budgetMs;
  try {
    for (let i = 0; i < bars.length; i++) {
      if (Date.now() > deadline) throw new Error("Custom strategy exceeded the execution time budget. Use incremental indicator calculations instead of rescanning all history each candle.");
      const bar = bars[i];
      if (bar.time < settings.start) {
        vm.step({ bar, index: i, symbol: dataset.symbol, equity: settings.capital, position: null, parameters: strategy.parameters || {} });
        continue;
      }
      // Funding at the open belongs to positions already held before that timestamp.
      while (fundingIndex < funding.length && funding[fundingIndex].time === bar.time) {
        const event = funding[fundingIndex++];
        const fundingPosition = position as Position | null;
        if (fundingPosition) { const cost = fundingPosition.sideNumber * fundingPosition.units * (event.markPrice ?? bar.open) * event.rate; cash -= cost; fundingPosition.funding += cost; totalFunding += cost; }
      }
      if (pendingExit && position) close(bar.open, bar, pendingExit === 100 ? "Signal" : "Partial signal", pendingExit);
      pendingExit = 0;
      if (order && !position && cash > 0) {
        const e = order.entry;
        if (i - order.submitted > (e.expiresAfterBars ?? (e.type === "market" || !e.type ? 1 : Infinity))) order = null;
        else {
          let mid: number | null = null;
          if (!e.type || e.type === "market") mid = bar.open;
          else if (e.type === "limit" && (e.side === "long" ? bar.low <= e.price! : bar.high >= e.price!)) mid = e.side === "long" ? Math.min(bar.open, e.price!) : Math.max(bar.open, e.price!);
          else if (e.type === "stop" && (e.side === "long" ? bar.high >= e.price! : bar.low <= e.price!)) mid = e.side === "long" ? Math.max(bar.open, e.price!) : Math.min(bar.open, e.price!);
          if (mid !== null) { fill(e, mid, bar); order = null; }
        }
      }
      const held = position as Position | null;
      if (held) {
        const stop = held.stopPrice, take = held.takeProfitPrice;
        if (stop !== null && (held.sideNumber === 1 ? bar.low <= stop : bar.high >= stop)) close(held.sideNumber === 1 ? Math.min(bar.open, stop) : Math.max(bar.open, stop), bar, "Stop loss", 100, true);
        else if (take !== null && (held.sideNumber === 1 ? bar.high >= take : bar.low <= take)) close(held.sideNumber === 1 ? Math.max(bar.open, take) : Math.min(bar.open, take), bar, "Take profit", 100, true);
      }
      const p = position as Position | null;
      if (p) { p.highestHigh = Math.max(p.highestHigh, bar.high); p.lowestLow = Math.min(p.lowestLow, bar.low); p.barsHeld++; }
      const equity = p ? cash + p.sideNumber * p.units * (bar.close - p.entry) : cash;
      curve.push({ time: bar.time + seconds, equity });
      const snapshot: ScriptPosition | null = p ? { side: p.side, entry: p.entry, entryTime: p.entryTime, units: p.units, stopPrice: p.stopPrice, takeProfitPrice: p.takeProfitPrice, initialRisk: p.initialRisk, highestHigh: p.highestHigh, lowestLow: p.lowestLow, barsHeld: p.barsHeld } : null;
      const decision = vm.step({ bar, index: i, symbol: dataset.symbol, equity, position: snapshot, parameters: strategy.parameters || {} });
      if (i === bars.length - 1) break;
      if (decision.cancelEntry) order = null;
      if (p) {
        if (decision.stopPrice !== undefined) p.stopPrice = p.stopPrice === null ? decision.stopPrice : p.sideNumber === 1 ? Math.max(p.stopPrice, decision.stopPrice) : Math.min(p.stopPrice, decision.stopPrice);
        if (decision.takeProfitPrice !== undefined) p.takeProfitPrice = decision.takeProfitPrice;
        if (decision.exit) pendingExit = 100;
        else if (decision.exitPct) pendingExit = decision.exitPct;
      } else if (decision.entry && cash > 0) order = { entry: decision.entry, submitted: i };
    }
    if (position) { const last = bars.at(-1)!; close(last.close, last, "End of test", 100, true); curve.at(-1)!.equity = cash; }
  } finally { vm.dispose(); }
  let peak = settings.capital, maxDrawdownPct = 0;
  for (const point of curve) { peak = Math.max(peak, point.equity); maxDrawdownPct = Math.max(maxDrawdownPct, (peak - point.equity) / peak * 100); }
  const daily = new Map<string, number>();
  for (const point of curve) daily.set(new Date(point.time * 1000).toISOString().slice(0, 10), point.equity);
  const days = [...daily.values()], returns = days.slice(1).map((value, i) => days[i] > 0 ? value / days[i] - 1 : 0);
  const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(1, returns.length);
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const wins = trades.filter((trade) => trade.pnl > 0), losses = trades.filter((trade) => trade.pnl < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0), grossLoss = -losses.reduce((sum, trade) => sum + trade.pnl, 0);
  const rs = trades.flatMap((trade) => trade.rMultiple !== undefined ? [trade.rMultiple] : []);
  if (intervals.some((gap) => gap > seconds * 1.5)) warnings.push("Historical data has missing candle intervals; no candles were fabricated to fill gaps.");
  return { id: crypto.randomUUID(), name, createdAt: Date.now(), symbol: dataset.symbol, strategyId, strategyName: strategy.name, settings, metrics: { netReturnPct: (cash / settings.capital - 1) * 100, maxDrawdownPct, sharpe: returns.length >= 20 && variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(365) : null, winRatePct: trades.length ? wins.length / trades.length * 100 : 0, tradeCount: trades.length, totalFees, totalFunding, profitFactor: grossLoss > 0 ? grossWin / grossLoss : null, averageRMultiple: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null }, curve, trades, warnings };
}

/** Executes fictional prices to check syntax, actions and bounded execution, not profitability. */
export async function validateScriptStrategy(strategy: Strategy): Promise<void> {
  if (strategy.version !== 3) return;
  for (const sign of [1, -1]) {
    const bars = Array.from({ length: 260 }, (_, i) => { const open = 1000 + sign * i + Math.sin(i / 5) * 10; const close = open + Math.cos(i / 7) * 2; return { time: 1700000000 + i * 14400, open, high: Math.max(open, close) + 8, low: Math.min(open, close) - 8, close, volume: 100 + i % 17, spread: 0 }; });
    await runProgrammableBacktest({ id: "check", symbol: "TEST", fileName: "Synthetic checks", importedAt: 0, skipped: 0, bars }, strategy, { capital: 10000, feeBps: 6, slippageBps: 2, start: bars[0].time, end: bars.at(-1)!.time }, "check", "Execution check", 2000);
  }
}
