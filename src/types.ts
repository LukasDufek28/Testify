export type IndicatorKind = "close" | "open" | "high" | "low" | "sma" | "ema" | "rsi";
export type Indicator = { kind: IndicatorKind; period?: number };
export type Rule = { left: Indicator; op: "gt" | "lt" | "crosses_above" | "crosses_below"; right: Indicator | number };
export type Strategy = {
  version: 1;
  name: string;
  description: string;
  side: "long" | "short" | "both";
  entryLong: Rule[];
  entryShort: Rule[];
  exitLong: Rule[];
  exitShort: Rule[];
  stopLossPct: number;
  takeProfitPct: number;
  allocationPct: number;
};
export type SavedStrategy = { id: string; name: string; source: string; updatedAt: number };
export type Bar = { time: number; open: number; high: number; low: number; close: number; spread: number; volume: number };
export type Dataset = { id: string; symbol: string; fileName: string; importedAt: number; utcOffset: number; point: number; bars: Bar[]; skipped: number };
export type Trade = { entryTime: number; exitTime: number; side: 1 | -1; entry: number; exit: number; pnl: number; returnPct: number; reason: string };
export type EquityPoint = { time: number; equity: number };
export type BacktestSettings = { capital: number; feeBps: number; slippageBps: number; useMt5Spread: boolean; start: number; end: number };
export type Run = { id: string; name: string; createdAt: number; symbol: string; granularity?: number; strategyId: string; strategyName: string; settings: BacktestSettings; metrics: { netReturnPct: number; maxDrawdownPct: number; sharpe: number | null; winRatePct: number; tradeCount: number; totalFees: number }; curve: EquityPoint[]; trades: Trade[]; warnings: string[] };

export const exampleStrategy: Strategy = {
  version: 1,
  name: "SMA crossover",
  description: "Enter when the 20-bar average crosses above the 50-bar average; exit on the reverse cross.",
  side: "long",
  entryLong: [{ left: { kind: "sma", period: 20 }, op: "crosses_above", right: { kind: "sma", period: 50 } }],
  entryShort: [],
  exitLong: [{ left: { kind: "sma", period: 20 }, op: "crosses_below", right: { kind: "sma", period: 50 } }],
  exitShort: [],
  stopLossPct: 1,
  takeProfitPct: 2,
  allocationPct: 100,
};

const kinds = new Set<IndicatorKind>(["close", "open", "high", "low", "sma", "ema", "rsi"]);
const ops = new Set<Rule["op"]>(["gt", "lt", "crosses_above", "crosses_below"]);
function indicator(value: unknown): value is Indicator {
  if (!value || typeof value !== "object") return false;
  const i = value as Indicator;
  return kinds.has(i.kind) && (!["sma", "ema", "rsi"].includes(i.kind) || (Number.isInteger(i.period) && i.period! >= 2 && i.period! <= 500));
}
function rules(value: unknown): value is Rule[] {
  return Array.isArray(value) && value.length <= 12 && value.every((r) => r && typeof r === "object" && indicator(r.left) && ops.has(r.op) && (indicator(r.right) || (typeof r.right === "number" && Number.isFinite(r.right))));
}
export function parseStrategy(source: string): Strategy {
  let s: Strategy;
  try { s = JSON.parse(source) as Strategy; } catch { throw new Error("Strategy is not valid JSON."); }
  if (s?.version !== 1 || typeof s.name !== "string" || !s.name.trim() || s.name.length > 100 || typeof s.description !== "string" || !["long", "short", "both"].includes(s.side) || !rules(s.entryLong) || !rules(s.entryShort) || !rules(s.exitLong) || !rules(s.exitShort)) throw new Error("Strategy does not match the Testify strategy format.");
  for (const n of [s.stopLossPct, s.takeProfitPct, s.allocationPct]) if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("Strategy risk values must be numbers.");
  if (s.stopLossPct < 0 || s.stopLossPct > 100 || s.takeProfitPct < 0 || s.takeProfitPct > 100 || s.allocationPct <= 0 || s.allocationPct > 100) throw new Error("Strategy risk values are outside allowed ranges.");
  if ((s.side === "long" || s.side === "both") && !s.entryLong.length) throw new Error("A long strategy needs at least one entry rule.");
  if ((s.side === "short" || s.side === "both") && !s.entryShort.length) throw new Error("A short strategy needs at least one entry rule.");
  return s;
}
