import test from "node:test";
import assert from "node:assert/strict";
import { combinePortfolio, aggregateRunPortfolio } from "../lib/shared/portfolio.js";

function run(capital, first, last, start = 1, end = 2) {
  return {
    settings: { capital },
    curve: [{ time: start, equity: first }, { time: end, equity: last }],
    metrics: { netReturnPct: (last / capital - 1) * 100 },
  };
}

test('dashboard combines actual dollar profit and starting capital across every saved run',()=>{
 const records=[run(1000,1000,900),run(2000,2000,2300)],before=structuredClone(records);
 const portfolio=aggregateRunPortfolio(records);
 assert.equal(portfolio.capital,3000);assert.equal(portfolio.netProfit,200);assert.equal(portfolio.curve.at(-1).equity,3200);
 assert.ok(Math.abs(portfolio.returnPct-200/3000*100)<1e-9);assert.equal(portfolio.runCount,2);assert.deepEqual(records,before);
});
test('dashboard holds idle and finished balances while aligning different test periods',()=>{
 const portfolio=aggregateRunPortfolio([run(1000,1000,800,1,2),run(2000,2000,2200,3,4)]);
 assert.deepEqual(portfolio.curve.map(p=>p.equity),[3000,2800,2800,3000]);assert.equal(portfolio.maxDrawdown,200);assert.ok(Math.abs(portfolio.maxDrawdownPct-200/3000*100)<1e-9);
});
test('dashboard rejects incomplete or invalid curves and keeps an empty account empty',()=>{
 const portfolio=aggregateRunPortfolio([run(1000,NaN,1200),run(1000,1000,1200,2,1),{settings:{capital:1000},curve:[]}]);
 assert.equal(portfolio.runCount,0);assert.equal(portfolio.excludedCount,3);assert.deepEqual(portfolio.curve,[]);assert.equal(aggregateRunPortfolio([]).capital,0);
});

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
