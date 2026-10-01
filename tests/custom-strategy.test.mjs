import test from "node:test";
import assert from "node:assert/strict";
import { parseStrategy } from "../lib/shared/types.js";
import { runBacktest } from "../lib/shared/engine.js";

const close = { op: "source", field: "close" };
const volume = { op: "source", field: "volume" };
const momentum = { op: "subtract", left: close, right: { op: "lag", input: close, period: 1 } };
const strategy = {
  version: 2, name: "Custom momentum", description: "A volume confirmed momentum jump",
  side: "long", indicators: [{ name: "Momentum", formula: momentum }, { name: "AverageVolume", formula: { op: "sma", input: volume, period: 5 } }],
  entryLong: [[
    { left: { kind: "custom", name: "Momentum" }, op: "crosses_above", right: 0 },
    { left: { kind: "volume" }, op: "gt", right: { kind: "custom", name: "AverageVolume" } },
  ], [{ left: { kind: "close" }, op: "gt", right: 100000 }]],
  entryShort: [], exitLong: [{ left: { kind: "custom", name: "Momentum" }, op: "crosses_below", right: 0 }], exitShort: [],
  stopLossPct: 0, takeProfitPct: 0, allocationPct: 100,
};

test("custom formulas and OR groups execute in the backtest", () => {
  const parsed = parseStrategy(JSON.stringify(strategy));
  const bars = Array.from({ length: 80 }, (_, i) => {
    const price = i < 25 ? 100 : i < 50 ? 110 : 100;
    return { time: 1_700_000_000 + i * 60, open: price, high: price + 1, low: price - 1, close: price, volume: i === 25 ? 20 : 10, spread: 0 };
  });
  const dataset = { id: "test", symbol: "BTC-USD", fileName: "test", importedAt: 0, utcOffset: 0, point: 0, bars, skipped: 0 };
  const run = runBacktest(dataset, parsed, { capital: 1000, feeBps: 0, slippageBps: 0, useMt5Spread: false, start: bars[0].time, end: bars.at(-1).time }, "test", "test");
  assert.equal(run.trades.length, 1);
  assert.equal(run.trades[0].entryTime, bars[26].time);
  assert.equal(run.trades[0].exitTime, bars[51].time);
});

test("custom formulas reject lookahead, missing references, and cycles", () => {
  const invalidLag = structuredClone(strategy);
  invalidLag.indicators[0].formula.right.period = -1;
  assert.throws(() => parseStrategy(JSON.stringify(invalidLag)), /Invalid formula/);
  const missing = structuredClone(strategy);
  missing.indicators[0].formula.right = { op: "ref", name: "Unknown" };
  assert.throws(() => parseStrategy(JSON.stringify(missing)), /Unknown custom indicator/);
  const cycle = structuredClone(strategy);
  cycle.indicators[0].formula = { op: "ref", name: "AverageVolume" };
  cycle.indicators[1].formula = { op: "ref", name: "Momentum" };
  assert.throws(() => parseStrategy(JSON.stringify(cycle)), /cycle/);
});
