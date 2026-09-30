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
const kinds = /* @__PURE__ */ new Set(["close", "open", "high", "low", "sma", "ema", "rsi"]);
const ops = /* @__PURE__ */ new Set(["gt", "lt", "crosses_above", "crosses_below"]);
function indicator(value) {
  if (!value || typeof value !== "object") return false;
  const i = value;
  return kinds.has(i.kind) && (!["sma", "ema", "rsi"].includes(i.kind) || Number.isInteger(i.period) && i.period >= 2 && i.period <= 500);
}
function rules(value) {
  return Array.isArray(value) && value.length <= 12 && value.every((r) => r && typeof r === "object" && indicator(r.left) && ops.has(r.op) && (indicator(r.right) || typeof r.right === "number" && Number.isFinite(r.right)));
}
function parseStrategy(source) {
  let s;
  try {
    s = JSON.parse(source);
  } catch {
    throw new Error("Strategy is not valid JSON.");
  }
  if (s?.version !== 1 || typeof s.name !== "string" || !s.name.trim() || s.name.length > 100 || typeof s.description !== "string" || !["long", "short", "both"].includes(s.side) || !rules(s.entryLong) || !rules(s.entryShort) || !rules(s.exitLong) || !rules(s.exitShort)) throw new Error("Strategy does not match the Testify strategy format.");
  for (const n of [s.stopLossPct, s.takeProfitPct, s.allocationPct]) if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("Strategy risk values must be numbers.");
  if (s.stopLossPct < 0 || s.stopLossPct > 100 || s.takeProfitPct < 0 || s.takeProfitPct > 100 || s.allocationPct <= 0 || s.allocationPct > 100) throw new Error("Strategy risk values are outside allowed ranges.");
  if ((s.side === "long" || s.side === "both") && !s.entryLong.length) throw new Error("A long strategy needs at least one entry rule.");
  if ((s.side === "short" || s.side === "both") && !s.entryShort.length) throw new Error("A short strategy needs at least one entry rule.");
  return s;
}
export {
  exampleStrategy,
  parseStrategy
};
