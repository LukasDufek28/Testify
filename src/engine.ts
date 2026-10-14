import {adversePrice,executionFee,validateExecutionOverrides} from "./execution-costs.js";
import type { BacktestSettings, Bar, Dataset, EquityPoint, Formula, Indicator, Rule, RuleSet, Run, Strategy, RuleStrategy, Trade } from "./types";

const key = (i: Indicator) => i.kind === "custom" ? `custom:${i.name!.toLowerCase()}` : `${i.kind}:${i.period ?? 0}`;
function rolling(input: number[], op: string, period: number): number[] {
  const output = Array<number>(input.length).fill(NaN);
  if (op === "sma") {
    let sum = 0; let valid = 0;
    for (let i = 0; i < input.length; i++) {
      if (Number.isFinite(input[i])) { sum += input[i]; valid++; }
      if (i >= period && Number.isFinite(input[i - period])) { sum -= input[i - period]; valid--; }
      if (valid === period) output[i] = sum / period;
    }
  } else if (op === "ema") {
    let count = 0; let seed = 0;
    const k = 2 / (period + 1);
    for (let i = 0; i < input.length; i++) {
      if (!Number.isFinite(input[i])) { count = 0; seed = 0; continue; }
      if (count < period) { seed += input[i]; count++; if (count === period) output[i] = seed / period; }
      else output[i] = input[i] * k + output[i - 1] * (1 - k);
    }
  } else if (op === "rsi") {
    let count = 0; let gains = 0; let losses = 0;
    for (let i = 1; i < input.length; i++) {
      if (!Number.isFinite(input[i]) || !Number.isFinite(input[i - 1])) { count = 0; gains = 0; losses = 0; continue; }
      const change = input[i] - input[i - 1]; const gain = Math.max(0, change); const loss = Math.max(0, -change);
      if (count < period) { gains += gain; losses += loss; count++; if (count === period) { gains /= period; losses /= period; } }
      else { gains = (gains * (period - 1) + gain) / period; losses = (losses * (period - 1) + loss) / period; }
      if (count >= period) output[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    }
  } else if (op === "stdev") {
    let sum = 0; let squares = 0; let valid = 0;
    for (let i = 0; i < input.length; i++) {
      if (Number.isFinite(input[i])) { sum += input[i]; squares += input[i] ** 2; valid++; }
      if (i >= period && Number.isFinite(input[i - period])) { sum -= input[i - period]; squares -= input[i - period] ** 2; valid--; }
      if (valid === period) output[i] = Math.sqrt(Math.max(0, squares / period - (sum / period) ** 2));
    }
  } else {
    const deque: number[] = []; let valid = 0;
    for (let i = period - 1; i < input.length; i++) {
      if (i === period - 1) {
        for (let j = 0; j < i; j++) {
          if (!Number.isFinite(input[j])) continue;
          valid++;
          while (deque.length && (op === "highest" ? input[deque.at(-1)!] <= input[j] : input[deque.at(-1)!] >= input[j])) deque.pop();
          deque.push(j);
        }
      }
      while (deque.length && deque[0] <= i - period) deque.shift();
      if (Number.isFinite(input[i])) {
        valid++;
        while (deque.length && (op === "highest" ? input[deque.at(-1)!] <= input[i] : input[deque.at(-1)!] >= input[i])) deque.pop();
        deque.push(i);
      }
      if (i > period - 1 && Number.isFinite(input[i - period])) valid--;
      if (valid === period) output[i] = input[deque[0]];
    }
  }
  return output;
}
function atrSeries(bars: Bar[], period: number): number[] {
  const trueRange = bars.map((bar, i) => i === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)));
  return rolling(trueRange, "sma", period);
}
function indicatorSeries(bars: Bar[], indicator: Indicator): number[] {
  const { kind, period = 0 } = indicator;
  if (["open", "high", "low", "close", "volume"].includes(kind)) return bars.map((b) => b[kind as "open" | "high" | "low" | "close" | "volume"]);
  if (kind === "atr") return atrSeries(bars, period);
  return rolling(bars.map((b) => b.close), kind, period);
}
function buildSeries(bars: Bar[], strategy: RuleStrategy): Map<string, number[]> {
  const definitions = new Map((strategy.indicators || []).map((item) => [item.name.toLowerCase(), item.formula]));
  const custom = new Map<string, number[]>();
  const expressionCache = new WeakMap<Formula, number[]>();
  const evaluate = (formula: Formula): number[] => {
    const cached = expressionCache.get(formula); if (cached) return cached;
    let result: number[];
    if (formula.op === "source") result = bars.map((bar) => bar[formula.field]);
    else if (formula.op === "constant") result = bars.map(() => formula.value);
    else if (formula.op === "ref") result = customSeries(formula.name);
    else if (["add", "subtract", "multiply", "divide", "min", "max"].includes(formula.op)) {
      const node = formula as Extract<Formula, { left: Formula }>;
      const left = evaluate(node.left); const right = evaluate(node.right);
      result = left.map((a, i) => { const b = right[i]; if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN; if (node.op === "add") return a + b; if (node.op === "subtract") return a - b; if (node.op === "multiply") return a * b; if (node.op === "divide") return b === 0 ? NaN : a / b; if (node.op === "min") return Math.min(a, b); return Math.max(a, b); });
    } else if (["abs", "negate", "cumsum"].includes(formula.op)) {
      const node = formula as Extract<Formula, { input: Formula }>;
      const input = evaluate(node.input); let sum = 0;
      result = input.map((value) => { if (!Number.isFinite(value)) return NaN; if (node.op === "abs") return Math.abs(value); if (node.op === "negate") return -value; sum += value; return sum; });
    } else if (formula.op === "atr") result = atrSeries(bars, formula.period);
    else {
      const node = formula as Extract<Formula, { input: Formula; period: number }>;
      const input = evaluate(node.input);
      result = node.op === "lag" ? input.map((_, i) => i >= node.period ? input[i - node.period] : NaN) : rolling(input, node.op, node.period);
    }
    expressionCache.set(formula, result);
    return result;
  };
  const customSeries = (name: string): number[] => {
    const normalized = name.toLowerCase();
    const cached = custom.get(normalized); if (cached) return cached;
    const expression = definitions.get(normalized);
    if (!expression) throw new Error(`Unknown custom indicator ${name}.`);
    const result = evaluate(expression); custom.set(normalized, result); return result;
  };
  const indicators: Indicator[] = [];
  for (const list of [strategy.entryLong, strategy.entryShort, strategy.exitLong, strategy.exitShort]) for (const group of (Array.isArray(list[0]) ? list as Rule[][] : [list as Rule[]])) for (const rule of group) { indicators.push(rule.left); if (typeof rule.right !== "number") indicators.push(rule.right); }
  const series = new Map<string, number[]>();
  for (const i of indicators) if (!series.has(key(i))) series.set(key(i), i.kind === "custom" ? customSeries(i.name!) : indicatorSeries(bars, i));
  return series;
}
function matches(rule: Rule, index: number, series: Map<string, number[]>): boolean {
  const left = series.get(key(rule.left))!;
  const right = typeof rule.right === "number" ? null : series.get(key(rule.right))!;
  const a = left[index]; const b = right ? right[index] : rule.right as number;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (rule.op === "gt") return a > b;
  if (rule.op === "lt") return a < b;
  if (index === 0) return false;
  const prevA = left[index - 1]; const prevB = right ? right[index - 1] : rule.right as number;
  if (!Number.isFinite(prevA) || !Number.isFinite(prevB)) return false;
  return rule.op === "crosses_above" ? prevA <= prevB && a > b : prevA >= prevB && a < b;
}
const all = (rules: RuleSet, index: number, series: Map<string, number[]>) => rules.length > 0 && (Array.isArray(rules[0]) ? (rules as Rule[][]).some((group) => group.every((r) => matches(r, index, series))) : (rules as Rule[]).every((r) => matches(r, index, series)));
type Position = { side: 1 | -1; entry: number; entryTime: number; units: number; equityAtEntry: number; entryFee: number };

export function runBacktest(dataset: Dataset, strategy: Strategy, settings: BacktestSettings, strategyId: string, name: string, onProgress?: (fraction: number) => void): Run {
  validateExecutionOverrides(settings);
  if (strategy.version === 3) throw new Error("Custom strategies must use runStrategyBacktest.");
  if(settings.riskPct&&strategy.stopLossPct<=0)throw new Error('Risk-based sizing needs a positive strategy stop loss.');

  if (!(settings.capital > 0) || !Number.isFinite(settings.capital)) throw new Error("Starting capital must be positive.");
  if (settings.feeBps < 0 || settings.slippageBps < 0 || !Number.isFinite(settings.feeBps + settings.slippageBps)) throw new Error("Trading costs must be nonnegative.");
  if (settings.feePerTrade !== undefined && (!Number.isFinite(settings.feePerTrade) || settings.feePerTrade < 0 || settings.feePerTrade > 1e9)) throw new Error("Fixed trade fee must be nonnegative and finite.");
  if (settings.warmupStart !== undefined && (!Number.isFinite(settings.warmupStart) || settings.warmupStart > settings.start)) throw new Error("Invalid warm-up start.");
  const bars = dataset.bars.filter((b) => b.time >= (settings.warmupStart ?? settings.start) && b.time <= settings.end);
  if (bars.filter(b => b.time >= settings.start).length < 20) throw new Error("The selected evaluation date range needs at least 20 bars.");
  if (bars.some((bar, i) => i > 0 && bar.time <= bars[i - 1].time)) throw new Error("Candles must be in chronological order without duplicate timestamps.");
  const intervals = bars.slice(1).map((b, i) => b.time - bars[i].time).filter((v) => v > 0).sort((a, b) => a - b);
  const coinbaseMinutes = dataset.fileName.match(/^Coinbase · (\d+)m$/)?.[1];
  const barSeconds = coinbaseMinutes ? Number(coinbaseMinutes) * 60 : intervals[Math.floor(intervals.length / 2)] || 60;
  onProgress?.(0);
  const series = buildSeries(bars, strategy);
  let cash = settings.capital; let position: Position | null = null; let pending: 0 | 1 | -1 | 2 = 0;
  let totalFees = 0; const curve: EquityPoint[] = []; const trades: Trade[] = []; const warnings: string[] = [];
  warnings.push(settings.spreadBps ? `A constant ${settings.spreadBps} bps spread was modeled as half the spread per fill, in addition to fees and slippage.` : "Spot candles have no bid/ask spread; only the entered fee and slippage assumptions were charged.");
  const adverse = (mid:number,side:1|-1,entering:boolean) => adversePrice(mid,side,entering,settings);
  const exit = (mid: number, bar: Bar, reason: string, atClose = false) => {
    if (!position) return;
    const p = position as Position;
    const price = adverse(mid, p.side, false);
    const fee = executionFee(p.units,price,settings);
    const pnl = p.side * p.units * (price - p.entry) - fee;
    cash += pnl; totalFees += fee;
    const initialRisk=p.units*p.entry*strategy.stopLossPct/100;
    trades.push({ entryTime: p.entryTime, exitTime: bar.time + (atClose ? barSeconds : 0), side: p.side, entry: p.entry, exit: price, pnl: pnl - p.entryFee, returnPct: (pnl - p.entryFee) / p.equityAtEntry * 100, ...(initialRisk>0?{rMultiple:(pnl-p.entryFee)/initialRisk}:{}), reason });
    position = null;
  };
  const enter = (side: 1 | -1, bar: Bar) => {
    const price = adverse(bar.open, side, true);
    const equityAtEntry = cash;
    if (settings.feePerTrade !== undefined && cash <= settings.feePerTrade / 2) return;
    const cap = (cash - (settings.feePerTrade ?? 0) / 2) * strategy.allocationPct / 100 / price;
    const units = settings.riskPct ? Math.min(cap,cash*settings.riskPct/100/(price*strategy.stopLossPct/100)) : cap;
    const fee = executionFee(units,price,settings);
    cash -= fee; totalFees += fee;
    position = { side, entry: price, entryTime: bar.time, units, equityAtEntry, entryFee: fee };
  };
  for (let i = 0; i < bars.length; i++) {
    if (i % Math.max(1, Math.ceil(bars.length / 100)) === 0) onProgress?.(i / bars.length);
    const bar = bars[i];
    if (bar.time < settings.start) continue;
    if (pending === 2) exit(bar.open, bar, "Signal");
    else if (pending === 1 || pending === -1) { if (position) exit(bar.open, bar, "Reverse signal"); if (cash > 0) enter(pending, bar); }
    pending = 0;
    if (position) {
      const p = position as Position;
      const stop = strategy.stopLossPct ? p.entry * (1 - p.side * strategy.stopLossPct / 100) : null;
      const take = strategy.takeProfitPct ? p.entry * (1 + p.side * strategy.takeProfitPct / 100) : null;
      const hitStop = stop !== null && (p.side === 1 ? bar.low <= stop : bar.high >= stop);
      const hitTake = take !== null && (p.side === 1 ? bar.high >= take : bar.low <= take);
      if (hitStop) exit(p.side === 1 ? Math.min(stop!, bar.open) : Math.max(stop!, bar.open), bar, "Stop loss", true);
      else if (hitTake) exit(p.side === 1 ? Math.max(take!, bar.open) : Math.min(take!, bar.open), bar, "Take profit", true);
    }
    const marked = position as Position | null;
    const equity = marked ? cash + marked.side * marked.units * (bar.close - marked.entry) : cash;
    curve.push({ time: bar.time + barSeconds, equity });
    if (i === bars.length - 1) break;
    if (position) {
      const p = position as Position;
      if (p.side === 1 && all(strategy.exitLong, i, series)) pending = 2;
      else if (p.side === -1 && all(strategy.exitShort, i, series)) pending = 2;
      else if (p.side === 1 && strategy.side !== "long" && all(strategy.entryShort, i, series)) pending = -1;
      else if (p.side === -1 && strategy.side !== "short" && all(strategy.entryLong, i, series)) pending = 1;
    } else if (strategy.side !== "short" && all(strategy.entryLong, i, series)) pending = 1;
    else if (strategy.side !== "long" && all(strategy.entryShort, i, series)) pending = -1;
  }
  if (position) { const last = bars[bars.length - 1]; exit(last.close, last, "End of test", true); curve[curve.length - 1].equity = cash; }
  let peak = settings.capital; let maxDrawdownPct = 0;
  onProgress?.(1);
  for (const point of curve) { peak = Math.max(peak, point.equity); maxDrawdownPct = Math.max(maxDrawdownPct, (peak - point.equity) / peak * 100); }
  const dailyClose = new Map<string, number>();
  for (const p of curve) dailyClose.set(new Date(p.time * 1000).toISOString().slice(0, 10), p.equity);
  const days = [...dailyClose.values()];
  const returns = days.slice(1).map((value, i) => days[i] > 0 ? value / days[i] - 1 : 0);
  const avg = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
  const variance = returns.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, returns.length - 1);
  const sharpe = returns.length >= 20 && variance > 0 ? avg / Math.sqrt(variance) * Math.sqrt(252) : null;
  if (returns.length < 20) warnings.push("Sharpe needs at least 20 daily returns, so it is unavailable for this short sample.");
  const gapCount = intervals.filter((v) => v > barSeconds * 3).length;
  if (gapCount) warnings.push(`${gapCount} gaps exceed three bar intervals; weekends and missing history can affect results.`);
  warnings.push("Bars do not reveal intrabar order; if stop and target both hit, the stop is assumed first.");
  return { id: crypto.randomUUID(), name, createdAt: Date.now(), symbol: dataset.symbol, strategyId, strategyName: strategy.name, settings, metrics: { netReturnPct: (cash / settings.capital - 1) * 100, maxDrawdownPct, sharpe, winRatePct: trades.length ? trades.filter((t) => t.pnl > 0).length / trades.length * 100 : 0, tradeCount: trades.length, totalFees }, curve, trades, warnings };
}
