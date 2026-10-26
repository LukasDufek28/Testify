import test from "node:test";
import assert from "node:assert/strict";
import { combinePortfolio, aggregateRunPortfolio, calendarMonthlyReturns } from "../lib/shared/portfolio.js";

test('monthly returns preserve actual changes, quiet covered months and UTC year boundaries',()=>{
 const series={settings:{capital:10000},curve:[{time:Date.UTC(2024,11,31,23)/1000,equity:9900},{time:Date.UTC(2025,2,1)/1000,equity:10100}]},before=structuredClone(series);
 const months=calendarMonthlyReturns(series);assert.deepEqual(months.map(m=>[m.key,m.profit]),[['2024-12',-100],['2025-01',0],['2025-02',0],['2025-03',200]]);
 assert.equal(months.reduce((sum,m)=>sum+m.profit,0)/months.length,25);assert.ok(Math.abs(months[0].returnPct+1)<1e-9);assert.deepEqual(series,before);
});
test('a single October loss remains one tested month for the average, rather than twelve diluted zero months',()=>{
 const months=calendarMonthlyReturns({settings:{capital:10000},curve:[{time:Date.UTC(2026,9,15)/1000,equity:9919}]});assert.equal(months.length,1);assert.equal(months[0].profit,-81);assert.ok(Math.abs(months[0].returnPct+.81)<1e-9);
 assert.deepEqual(calendarMonthlyReturns(),[]);assert.deepEqual(calendarMonthlyReturns({settings:{capital:10000},curve:[]}),[]);
});

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
