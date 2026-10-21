import test from 'node:test';
import assert from 'node:assert/strict';
import { resultMetrics, drawdownCurve, monthlyReturns, tradeR, tradeLevels, tradesCsv, comparisonCsv, sampleCurve, formatTradePrice } from '../lib/shared/results.js';
import { exampleStrategy } from '../lib/shared/types.js';
const rules={...exampleStrategy,stopLossPct:2,allocationPct:50};
test('trade prices preserve cents and small-asset precision without changing numeric exports',()=>{
 assert.equal(formatTradePrice(84873.27),'$84,873.27');
 assert.equal(formatTradePrice(.000012345),'$0.000012345');
 assert.equal(formatTradePrice(1.2345e-14),'$1.2345e-14');
 assert.equal(formatTradePrice(.081234),'$0.081234');
 assert.equal(formatTradePrice(0),'$0.00');
 assert.equal(formatTradePrice(NaN),'—');
});
const run={name:'CSV "run"',strategyName:'=unsafe',symbol:'BTC-USD',strategySource:JSON.stringify(rules),settings:{capital:1000,start:1735689600,end:1740787200,feeBps:2,slippageBps:1},metrics:{netReturnPct:5},trades:[{entryTime:1735689600,exitTime:1735693200,side:1,entry:100,exit:102,pnl:80,returnPct:8,reason:'Take profit'},{entryTime:1735693200,exitTime:1735696800,side:-1,entry:102,exit:103,pnl:-40,returnPct:-4,reason:'Stop loss'}],curve:[{time:1735689600,equity:1100},{time:1735776000,equity:990},{time:1738368000,equity:1050}]};

test('trade review and CSV use measured levels, retain explicit disabled targets and avoid inventing script levels',()=>{
 const measured={...run.trades[0],stopLoss:97.5,takeProfit:108};
 assert.deepEqual(tradeLevels(run,measured),{stopLoss:97.5,takeProfit:108});
 assert.deepEqual(tradeLevels(run,{...measured,stopLoss:null,takeProfit:null}),{stopLoss:null,takeProfit:null});
 assert.equal(tradeLevels(run,run.trades[0]).stopLoss,100*(1-rules.stopLossPct/100));
 const scriptRun={...run,strategySource:JSON.stringify({version:3,runtime:'javascript',name:'Custom',description:'Custom',code:'function onBar(){return {}}'})};
 assert.deepEqual(tradeLevels(scriptRun,run.trades[0]),{stopLoss:null,takeProfit:null});
 const csv=tradesCsv({...scriptRun,trades:[measured]});assert.ok(csv.includes('Stop loss at exit'));assert.ok(csv.endsWith('"97.5","108"'));
});
test('result metrics use net trade P/L and saved initial stop risk',()=>{assert.equal(resultMetrics(run).netProfit,50);assert.equal(resultMetrics(run).profitFactor,2);assert.equal(resultMetrics(run).averageR,2);assert.equal(tradeR(run,run.trades[0]),8);assert.equal(tradeR({...run,strategySource:undefined},run.trades[0]),null);assert.equal(tradeR({...run,strategySource:JSON.stringify({...rules,stopLossPct:0})},run.trades[0]),null);assert.equal(resultMetrics({...run,trades:[]}).profitFactor,null);assert.equal(resultMetrics({...run,trades:[run.trades[0]]}).profitFactor,Infinity);});
test('drawdown tracks running peaks and monthly returns compound from initial capital',()=>{assert.deepEqual(drawdownCurve(run).map(p=>Math.round(p.equity)),[0,-10,-5]);const months=monthlyReturns(run);assert.deepEqual(months.map(m=>m.month),['2025-01','2025-02']);assert.ok(Math.abs(months[0].value+1)<1e-9);assert.ok(Math.abs(months[1].value-(1050/990-1)*100)<1e-9);assert.deepEqual(monthlyReturns({...run,curve:[]}),[]);});
test('CSV exports include all trades, original assumptions, escaped names and formula-safe strings',()=>{const csv=tradesCsv(run);assert.equal(csv.split('\r\n').length,3);assert.ok(csv.includes('CSV ""run""'));assert.ok(csv.includes("'=unsafe"));assert.ok(csv.includes('2025-01-01T00:00:00.000Z'));const comparison=comparisonCsv([{...run,metrics:{...run.metrics,maxDrawdownPct:10,winRatePct:50,tradeCount:2},granularity:3600}]);assert.ok(comparison.includes('Starting capital'));assert.ok(comparison.includes('"1000","2","1"'));});

test('chart sampling retains endpoints, peaks, troughs and chronology on large runs',()=>{const points=Array.from({length:10000},(_,i)=>({time:i,equity:100}));points[4567].equity=500;points[5678].equity=25;const sampled=sampleCurve(points);assert.ok(sampled.length<=1800);assert.deepEqual(sampled[0],points[0]);assert.deepEqual(sampled.at(-1),points.at(-1));assert.ok(sampled.includes(points[4567]));assert.ok(sampled.includes(points[5678]));assert.ok(sampled.every((p,i)=>!i||p.time>sampled[i-1].time));});
