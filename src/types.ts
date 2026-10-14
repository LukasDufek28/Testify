export type IndicatorKind = "close" | "open" | "high" | "low" | "volume" | "sma" | "ema" | "rsi" | "atr" | "custom";
export type Indicator = { kind: IndicatorKind; period?: number; name?: string };
export type Rule = { left: Indicator; op: "gt" | "lt" | "crosses_above" | "crosses_below"; right: Indicator | number };
export type RuleSet = Rule[] | Rule[][];
export type Formula =
  | { op: "source"; field: "open" | "high" | "low" | "close" | "volume" }
  | { op: "constant"; value: number }
  | { op: "ref"; name: string }
  | { op: "add" | "subtract" | "multiply" | "divide" | "min" | "max"; left: Formula; right: Formula }
  | { op: "abs" | "negate" | "cumsum"; input: Formula }
  | { op: "lag" | "sma" | "ema" | "rsi" | "highest" | "lowest" | "stdev"; input: Formula; period: number }
  | { op: "atr"; period: number };
export type CustomIndicator = { name: string; formula: Formula };
export type RuleStrategy = {
  version: 1 | 2;
  name: string;
  description: string;
  side: "long" | "short" | "both";
  indicators?: CustomIndicator[];
  entryLong: RuleSet;
  entryShort: RuleSet;
  exitLong: RuleSet;
  exitShort: RuleSet;
  stopLossPct: number;
  takeProfitPct: number;
  allocationPct: number;
};
export type ScriptStrategy = {
  version: 3;
  name: string;
  description: string;
  runtime: "javascript";
  code: string;
  parameters?: Record<string, number | string | boolean>;
};
export type Strategy = RuleStrategy | ScriptStrategy;
export type SavedStrategy = { id: string; name: string; source: string; updatedAt: number; revision?: number };
export type Bar = { time: number; open: number; high: number; low: number; close: number; spread: number; volume: number };
export type Dataset = { id: string; symbol: string; fileName: string; importedAt: number; utcOffset?: number; point?: number; bars: Bar[]; skipped: number; funding?: { time: number; rate: number; markPrice?: number }[]; validation?: import("./data-validation").DataValidation };
export type Trade = { entryTime: number; exitTime: number; side: 1 | -1; entry: number; exit: number; pnl: number; returnPct: number; reason: string; rMultiple?: number; funding?: number };
export type EquityPoint = { time: number; equity: number };
export type BacktestSettings = { capital: number; useMt5Spread?: boolean; feeBps: number; feePerTrade?: number; slippageBps: number; start: number; end: number; warmupStart?: number };
export type ResearchWindow = { phase: "development" | "validation" | "holdout"; fullStart: number; fullEnd: number; boundary: number; holdoutStart?: number; splitPct: number; parentRunId?: string };
export type Run = { id: string; name: string; createdAt: number; symbol: string; granularity?: number; datasetId?: string; priceDatasetId?: string; strategyId: string; strategyName: string; strategySource?: string; research?: ResearchWindow; settings: BacktestSettings; metrics: { netReturnPct: number; maxDrawdownPct: number; sharpe: number | null; winRatePct: number; tradeCount: number; totalFees: number; profitFactor?: number | null; averageRMultiple?: number | null; totalFunding?: number }; curve: EquityPoint[]; trades: Trade[]; warnings: string[]; summaryOnly?: boolean; cloudLinked?: boolean };


export const exampleStrategy: RuleStrategy = {
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

const kinds = new Set<IndicatorKind>(["close", "open", "high", "low", "volume", "sma", "ema", "rsi", "atr", "custom"]);
const ops = new Set<Rule["op"]>(["gt", "lt", "crosses_above", "crosses_below"]);
const validName = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value);
function indicator(value: unknown): value is Indicator {
  if (!value || typeof value !== "object") return false;
  const i = value as Indicator;
  return kinds.has(i.kind) && (i.kind !== "custom" || validName(i.name)) && (!["sma", "ema", "rsi", "atr"].includes(i.kind) || (Number.isInteger(i.period) && i.period! >= 2 && i.period! <= 500));
}
function rule(value: unknown): value is Rule {
  const r = value as Rule;
  return !!r && typeof r === "object" && indicator(r.left) && ops.has(r.op) && (indicator(r.right) || (typeof r.right === "number" && Number.isFinite(r.right)));
}
function rules(value: unknown): value is RuleSet {
  return Array.isArray(value) && value.length <= 12 && (value.every(rule) || (value.length <= 8 && value.every((group) => Array.isArray(group) && group.length > 0 && group.length <= 12 && group.every(rule))));
}
function hasRules(value: RuleSet): boolean { return value.length > 0; }
function formula(value: unknown, refs: Set<string>, budget: { nodes: number }, depth = 0): value is Formula {
  if (!value || typeof value !== "object" || depth > 12 || ++budget.nodes > 300) return false;
  const node = value as Record<string, unknown>;
  if (node.op === "source") return ["open", "high", "low", "close", "volume"].includes(String(node.field));
  if (node.op === "constant") return typeof node.value === "number" && Number.isFinite(node.value) && Math.abs(node.value) <= 1e12;
  if (node.op === "ref") { if (!validName(node.name)) return false; refs.add(node.name.toLowerCase()); return true; }
  if (["add", "subtract", "multiply", "divide", "min", "max"].includes(String(node.op))) return formula(node.left, refs, budget, depth + 1) && formula(node.right, refs, budget, depth + 1);
  if (["abs", "negate", "cumsum"].includes(String(node.op))) return formula(node.input, refs, budget, depth + 1);
  if (node.op === "atr") return Number.isInteger(node.period) && (node.period as number) >= 2 && (node.period as number) <= 500;
  if (["lag", "sma", "ema", "rsi", "highest", "lowest", "stdev"].includes(String(node.op))) return Number.isInteger(node.period) && (node.period as number) >= (node.op === "lag" ? 1 : 2) && (node.period as number) <= 500 && formula(node.input, refs, budget, depth + 1);
  return false;
}
export function parseStrategy(source: string): Strategy {
  let parsed: Strategy;
  try { parsed = JSON.parse(source) as Strategy; } catch { throw new Error("Strategy is not valid JSON."); }
  if (parsed?.version === 3) {
    if (typeof parsed.name !== "string" || !parsed.name.trim() || parsed.name.length > 100 || typeof parsed.description !== "string") throw new Error("Custom strategy needs a name and description.");
    if (parsed.runtime !== "javascript" || typeof parsed.code !== "string" || !parsed.code.trim() || parsed.code.length > 60000) throw new Error("Custom strategy must contain JavaScript code (up to 60,000 characters).");
    if (parsed.parameters !== undefined && (!parsed.parameters || typeof parsed.parameters !== "object" || Array.isArray(parsed.parameters) || JSON.stringify(parsed.parameters).length > 10000 || Object.values(parsed.parameters).some((v) => !["string", "number", "boolean"].includes(typeof v) || (typeof v === "number" && !Number.isFinite(v))))) throw new Error("Custom strategy parameters must be finite numbers, strings or booleans.");
    return parsed;
  }
  const s = parsed as RuleStrategy;
  if (![1, 2].includes(s?.version) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 100 || typeof s.description !== "string" || !["long", "short", "both"].includes(s.side) || !rules(s.entryLong) || !rules(s.entryShort) || !rules(s.exitLong) || !rules(s.exitShort)) throw new Error("Strategy does not match the Testify strategy format.");
  if (s.indicators !== undefined) {
    if (!Array.isArray(s.indicators) || s.indicators.length > 16) throw new Error("A strategy can define at most 16 custom indicators.");
    const definitions = new Map<string, Set<string>>();
    const budget = { nodes: 0 };
    for (const item of s.indicators) {
      if (!item || !validName(item.name) || definitions.has(item.name.toLowerCase())) throw new Error("Custom indicator names must be unique letters and numbers, starting with a letter.");
      const refs = new Set<string>();
      if (!formula(item.formula, refs, budget)) throw new Error(`Invalid formula for ${item.name}.`);
      definitions.set(item.name.toLowerCase(), refs);
    }
    for (const list of [s.entryLong, s.entryShort, s.exitLong, s.exitShort]) for (const group of (Array.isArray(list[0]) ? list as Rule[][] : [list as Rule[]])) for (const r of group) for (const operand of [r.left, r.right]) if (typeof operand !== "number" && operand.kind === "custom" && !definitions.has(operand.name!.toLowerCase())) throw new Error(`Unknown custom indicator ${operand.name}.`);
    const visited = new Set<string>(); const active = new Set<string>();
    const visit = (name: string) => { if (active.has(name)) throw new Error("Custom indicators cannot reference each other in a cycle."); if (visited.has(name)) return; if (!definitions.has(name)) throw new Error(`Unknown custom indicator ${name}.`); active.add(name); for (const ref of definitions.get(name)!) visit(ref); active.delete(name); visited.add(name); };
    for (const name of definitions.keys()) visit(name);
  } else if ([s.entryLong, s.entryShort, s.exitLong, s.exitShort].some((list) => (Array.isArray(list[0]) ? list as Rule[][] : [list as Rule[]]).some((group) => group.some((r) => r.left.kind === "custom" || (typeof r.right !== "number" && r.right.kind === "custom"))))) throw new Error("Custom rules need indicator definitions.");
  for (const n of [s.stopLossPct, s.takeProfitPct, s.allocationPct]) if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("Strategy risk values must be numbers.");
  if (s.stopLossPct < 0 || s.stopLossPct > 100 || s.takeProfitPct < 0 || s.takeProfitPct > 100 || s.allocationPct <= 0 || s.allocationPct > 100) throw new Error("Strategy risk values are outside allowed ranges.");
  if ((s.side === "long" || s.side === "both") && !hasRules(s.entryLong)) throw new Error("A long strategy needs at least one entry rule.");
  if ((s.side === "short" || s.side === "both") && !hasRules(s.entryShort)) throw new Error("A short strategy needs at least one entry rule.");
  return s;
}
