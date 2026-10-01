import test from "node:test";
import assert from "node:assert/strict";
import { researchWindow, sameResearchWindow, summarizeDevelopmentRun } from "../lib/shared/research.js";

test("development and holdout use one saved, nonoverlapping boundary", () => {
  const window = researchWindow(1_700_000_000, 1_700_100_000, 70);
  assert.equal(window.boundary, 1_700_070_000);
  assert.equal(window.boundary - window.fullStart, 70_000);
  assert.equal(window.fullEnd - window.boundary, 30_000);
  const a = { research: { ...window, phase: "development" } };
  const b = { research: { ...window, phase: "development" } };
  assert.equal(sameResearchWindow(a, b), true);
  assert.equal(sameResearchWindow(a, { research: { ...window, boundary: window.boundary + 60 } }), false);
});

test("Gemini summary includes fee and trading data but no reserved-period results", () => {
  const run = { name: "Fee test", symbol: "BTC-USD", granularity: 3600, research: { phase: "development" }, settings: { start: 100, end: 200, capital: 1000, feeBps: 2, slippageBps: 1 }, metrics: { netReturnPct: -3, maxDrawdownPct: 5, sharpe: null, winRatePct: 40, tradeCount: 2, totalFees: 7 }, trades: [{ pnl: -10, reason: "Stop loss" }, { pnl: 5, reason: "Signal" }], curve: [{ time: 300, equity: 999 }] };
  const summary = summarizeDevelopmentRun(run);
  assert.equal(summary.averageTradePnl, -2.5);
  assert.equal(summary.totalFees, 7);
  assert.equal(summary.lossCount, 1);
  assert.equal(summary.phase, "development");
  assert.equal(JSON.stringify(summary).includes("300"), false);
  assert.throws(() => summarizeDevelopmentRun({ ...run, research: { phase: "validation" } }), /development/);
});
