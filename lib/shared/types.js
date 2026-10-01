const exampleStrategy = {
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
  allocationPct: 100
};
const kinds = /* @__PURE__ */ new Set(["close", "open", "high", "low", "volume", "sma", "ema", "rsi", "atr", "custom"]);
const ops = /* @__PURE__ */ new Set(["gt", "lt", "crosses_above", "crosses_below"]);
const validName = (value) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value);
function indicator(value) {
  if (!value || typeof value !== "object") return false;
  const i = value;
  return kinds.has(i.kind) && (i.kind !== "custom" || validName(i.name)) && (!["sma", "ema", "rsi", "atr"].includes(i.kind) || Number.isInteger(i.period) && i.period >= 2 && i.period <= 500);
}
function rule(value) {
  const r = value;
  return !!r && typeof r === "object" && indicator(r.left) && ops.has(r.op) && (indicator(r.right) || typeof r.right === "number" && Number.isFinite(r.right));
}
function rules(value) {
  return Array.isArray(value) && value.length <= 12 && (value.every(rule) || value.length <= 8 && value.every((group) => Array.isArray(group) && group.length > 0 && group.length <= 12 && group.every(rule)));
}
function hasRules(value) {
  return value.length > 0;
}
function formula(value, refs, budget, depth = 0) {
  if (!value || typeof value !== "object" || depth > 12 || ++budget.nodes > 300) return false;
  const node = value;
  if (node.op === "source") return ["open", "high", "low", "close", "volume"].includes(String(node.field));
  if (node.op === "constant") return typeof node.value === "number" && Number.isFinite(node.value) && Math.abs(node.value) <= 1e12;
  if (node.op === "ref") {
    if (!validName(node.name)) return false;
    refs.add(node.name.toLowerCase());
    return true;
  }
  if (["add", "subtract", "multiply", "divide", "min", "max"].includes(String(node.op))) return formula(node.left, refs, budget, depth + 1) && formula(node.right, refs, budget, depth + 1);
  if (["abs", "negate", "cumsum"].includes(String(node.op))) return formula(node.input, refs, budget, depth + 1);
  if (node.op === "atr") return Number.isInteger(node.period) && node.period >= 2 && node.period <= 500;
  if (["lag", "sma", "ema", "rsi", "highest", "lowest", "stdev"].includes(String(node.op))) return Number.isInteger(node.period) && node.period >= (node.op === "lag" ? 1 : 2) && node.period <= 500 && formula(node.input, refs, budget, depth + 1);
  return false;
}
function parseStrategy(source) {
  let s;
  try {
    s = JSON.parse(source);
  } catch {
    throw new Error("Strategy is not valid JSON.");
  }
  if (![1, 2].includes(s?.version) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 100 || typeof s.description !== "string" || !["long", "short", "both"].includes(s.side) || !rules(s.entryLong) || !rules(s.entryShort) || !rules(s.exitLong) || !rules(s.exitShort)) throw new Error("Strategy does not match the Testify strategy format.");
  if (s.indicators !== void 0) {
    if (!Array.isArray(s.indicators) || s.indicators.length > 16) throw new Error("A strategy can define at most 16 custom indicators.");
    const definitions = /* @__PURE__ */ new Map();
    const budget = { nodes: 0 };
    for (const item of s.indicators) {
      if (!item || !validName(item.name) || definitions.has(item.name.toLowerCase())) throw new Error("Custom indicator names must be unique letters and numbers, starting with a letter.");
      const refs = /* @__PURE__ */ new Set();
      if (!formula(item.formula, refs, budget)) throw new Error(`Invalid formula for ${item.name}.`);
      definitions.set(item.name.toLowerCase(), refs);
    }
    for (const list of [s.entryLong, s.entryShort, s.exitLong, s.exitShort]) for (const group of Array.isArray(list[0]) ? list : [list]) for (const r of group) for (const operand of [r.left, r.right]) if (typeof operand !== "number" && operand.kind === "custom" && !definitions.has(operand.name.toLowerCase())) throw new Error(`Unknown custom indicator ${operand.name}.`);
    const visited = /* @__PURE__ */ new Set();
    const active = /* @__PURE__ */ new Set();
    const visit = (name) => {
      if (active.has(name)) throw new Error("Custom indicators cannot reference each other in a cycle.");
      if (visited.has(name)) return;
      if (!definitions.has(name)) throw new Error(`Unknown custom indicator ${name}.`);
      active.add(name);
      for (const ref of definitions.get(name)) visit(ref);
      active.delete(name);
      visited.add(name);
    };
    for (const name of definitions.keys()) visit(name);
  } else if ([s.entryLong, s.entryShort, s.exitLong, s.exitShort].some((list) => (Array.isArray(list[0]) ? list : [list]).some((group) => group.some((r) => r.left.kind === "custom" || typeof r.right !== "number" && r.right.kind === "custom")))) throw new Error("Custom rules need indicator definitions.");
  for (const n of [s.stopLossPct, s.takeProfitPct, s.allocationPct]) if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("Strategy risk values must be numbers.");
  if (s.stopLossPct < 0 || s.stopLossPct > 100 || s.takeProfitPct < 0 || s.takeProfitPct > 100 || s.allocationPct <= 0 || s.allocationPct > 100) throw new Error("Strategy risk values are outside allowed ranges.");
  if ((s.side === "long" || s.side === "both") && !hasRules(s.entryLong)) throw new Error("A long strategy needs at least one entry rule.");
  if ((s.side === "short" || s.side === "both") && !hasRules(s.entryShort)) throw new Error("A short strategy needs at least one entry rule.");
  return s;
}
export {
  exampleStrategy,
  parseStrategy
};
