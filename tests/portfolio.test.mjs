import test from "node:test";
import assert from "node:assert/strict";
import { combinePortfolio } from "../lib/shared/portfolio.js";

function run(capital, first, last, start = 1, end = 2) {
  return {
    settings: { capital },
    curve: [{ time: start, equity: first }, { time: end, equity: last }],
    metrics: { netReturnPct: (last / capital - 1) * 100 },
  };
}

test("combined portfolio sums full-capital percentage returns", () => {
  const portfolio = combinePortfolio([run(1000, 1000, 900), run(2000, 2000, 2300)]);
  assert.ok(Math.abs(portfolio.returnPct - 5) < 1e-9);
  assert.equal(portfolio.capital, 1000);
  assert.deepEqual(portfolio.curve.map((point) => point.time), [1, 2]);
  assert.ok(Math.abs(portfolio.curve.at(-1).equity - 1050) < 1e-9);
});

test("combined portfolio aligns runs by time and carries finished values forward", () => {
  const portfolio = combinePortfolio([run(1000, 1000, 900, 1, 2), run(1000, 1000, 1150, 2, 3)]);
  assert.deepEqual(portfolio.curve.map((point) => point.time), [1, 2, 3]);
  assert.equal(portfolio.curve[1].equity, 900);
  assert.ok(Math.abs(portfolio.curve[2].equity - 1050) < 1e-9);
});
