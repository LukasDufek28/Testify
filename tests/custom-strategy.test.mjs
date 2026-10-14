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
  const dataset = { id: "test", symbol: "BTC-USD", fileName: "test", importedAt: 0, bars, skipped: 0 };
  const run = runBacktest(dataset, parsed, { capital: 1000, feeBps: 0, slippageBps: 0, start: bars[0].time, end: bars.at(-1).time }, "test", "test");
  assert.equal(run.trades.length, 1);
  assert.equal(run.trades[0].entryTime, bars[26].time);
  assert.equal(run.trades[0].exitTime, bars[51].time);
  assert.equal(run.curve[25].time, bars[25].time + 60);
  const partial = runBacktest({ ...dataset, bars: bars.slice(0, 40) }, parsed, { capital: 1000, feeBps: 0, slippageBps: 0, start: bars[0].time, end: bars[39].time }, "test", "partial");
  assert.deepEqual(partial.curve.slice(0, -1), run.curve.slice(0, 39));
});

test("out-of-order candles cannot feed later prices into earlier signals", () => {
  const parsed = parseStrategy(JSON.stringify(strategy));
  const bars = Array.from({ length: 25 }, (_, i) => ({ time: 1_700_000_000 + i * 60, open: 100, high: 101, low: 99, close: 100, volume: 10, spread: 0 }));
  [bars[10], bars[11]] = [bars[11], bars[10]];
  const dataset = { id: "test", symbol: "BTC-USD", fileName: "test", importedAt: 0, bars, skipped: 0 };
  assert.throws(() => runBacktest(dataset, parsed, { capital: 1000, feeBps: 0, slippageBps: 0, start: bars[0].time, end: bars.at(-1).time }, "test", "test"), /chronological order/);
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

test('progress reports actual processed bars without changing backtest results', () => {
  const bars=Array.from({length:500},(_,i)=>({time:1700000000+i*60,open:100+i*.01,high:102+i*.01,low:99+i*.01,close:101+i*.01,volume:100,spread:0}));
  const dataset={id:'progress',symbol:'BTC-USD',fileName:'test',importedAt:0,utcOffset:0,point:0,bars,skipped:0};
  const settings={capital:10000,feeBps:2,slippageBps:1,useMt5Spread:false,start:bars[0].time,end:bars.at(-1).time};
  const values=[];
  const result=runBacktest(dataset,strategy,settings,'s','test',value=>values.push(value));
  assert.equal(values[0],0);assert.equal(values.at(-1),1);
  assert.ok(values.length>20);assert.ok(values.every((v,i)=>v>=0&&v<=1&&(!i||v>=values[i-1])));
  const baseline=runBacktest(dataset,strategy,settings,'s','test');
  assert.deepEqual(result.curve,baseline.curve);assert.deepEqual(result.trades,baseline.trades);assert.deepEqual(result.metrics,baseline.metrics);
});
