import test from "node:test";
import assert from "node:assert/strict";
import { parseStrategy } from "../lib/shared/types.js";
import { runStrategyBacktest, validateScriptStrategy } from "../lib/shared/programmable-engine.js";
import { createScriptRuntime } from "../lib/shared/script-runtime.js";

const bar = (i, price = 100) => ({ time: 1700000000 + i * 14400, open: price, high: price + 1, low: price - 1, close: price, volume: 10, spread: 0 });
const dataset = (bars) => ({ id: "test", symbol: "BTC-USD", fileName: "test", importedAt: 0, skipped: 0, bars });
const script = (code) => parseStrategy(JSON.stringify({ version: 3, runtime: "javascript", name: "Test", description: "Test", code }));
const run = (strategy, bars, costs = {}) => runStrategyBacktest(dataset(bars), strategy, { capital: 10000, feeBps: 0, slippageBps: 0, start: bars[0].time, end: bars.at(-1).time, ...costs }, "test", "test");

test('run-level risk overrides script risk and cannot size a trade without a stop',async()=>{
 const bars=Array.from({length:25},(_,i)=>bar(i,i<5?100:110));
 await assert.rejects(run(script(`function onBar(ctx){return ctx.index===0?{entry:{side:'long'}}:{}}`),bars,{riskPct:.5}),/positive initial stop/);
 const result=await run(script(`function onBar(ctx){return ctx.index===0?{entry:{side:'long',stopDistance:10,takeProfitPrice:110,riskPct:2}}:{}}`),bars,{riskPct:.5});
 assert.equal(result.trades.length,1);assert.equal(result.trades[0].pnl,50);assert.equal(result.trades[0].rMultiple,1);
});

test("custom state gets immutable causal history, has no host APIs, and resets per run", async () => {
  const strategy = script(`let n=0; function onBar(ctx) { n++; if(n!==ctx.index+1 || ctx.history.length!==n || ctx.history[n]!==undefined) throw new Error('future or state'); if(typeof fetch!=='undefined' || typeof process!=='undefined' || typeof window!=='undefined' || typeof require!=='undefined' || typeof Date!=='undefined') throw new Error('host leak'); if(!Object.isFrozen(ctx.bar) || !Object.isFrozen(ctx.parameters)) throw new Error('mutable'); if(ctx.index===3) return {entry:{side:'long',stopDistance:5,riskPct:0.5}}; if(ctx.position && ctx.index===8) return {exit:true}; return {}; }`);
  const bars = Array.from({length:30},(_,i)=>bar(i));
  const first = await run(strategy,bars), second = await run(strategy,bars);
  assert.equal(first.trades.length,1);assert.equal(first.trades[0].entryTime,bars[4].time);assert.equal(first.trades[0].exitTime,bars[9].time);assert.deepEqual(first.trades,second.trades);
  const prefix = await run(strategy,bars.slice(0,20));
  assert.deepEqual(prefix.curve.slice(0,-1),first.curve.slice(0,19));
});

test("history mutation and infinite loops fail inside the sandbox", async () => {
  const bars=Array.from({length:20},(_,i)=>bar(i));
  await assert.rejects(run(script(`function onBar(ctx){ctx.history.push(ctx.bar);return {};}`),bars),/read-only/);
  await assert.rejects(run(script(`function onBar(ctx){while(true){} }`),bars),/interrupted/);
  await assert.rejects(validateScriptStrategy(script(`function onBar( {`)),/Custom strategy/);
  await assert.rejects(run(script(`function onBar(ctx){return {entry:{side:'long',riskPct:1}};}`),bars),/initial stop/);
});

test("risk uses actual fill, fees and slippage; gaps fill stops at the adverse open", async () => {
  const strategy=script(`function onBar(ctx){if(ctx.index===0)return {entry:{side:'long',stopDistance:10,riskPct:0.5}};return {};}`);
  const bars=Array.from({length:20},(_,i)=>bar(i,i>=2?80:100));
  const result=await run(strategy,bars,{feeBps:6,slippageBps:2});
  assert.equal(result.trades.length,1);
  assert.ok(Math.abs(result.trades[0].entry-100.02)<1e-9);
  assert.ok(Math.abs(result.trades[0].exit-79.984)<1e-9);
  assert.equal(result.trades[0].reason,"Stop loss");
  assert.ok(Math.abs(result.trades[0].pnl-(-100.720012))<1e-6);
  assert.ok(Math.abs(result.trades[0].rMultiple-result.trades[0].pnl/50)<1e-9);
});

test("trail updates apply next candle and cannot widen a stop", async () => {
  const bars=Array.from({length:20},(_,i)=>bar(i));
  bars[2]={...bars[2],high:110,low:99,close:109};
  bars[3]={...bars[3],open:109,high:110,low:106,close:109};
  bars[4]={...bars[4],open:109,high:110,low:104,close:106};
  const strategy=script(`function onBar(ctx){if(ctx.index===0)return {entry:{side:'long',stopDistance:20,riskPct:1}};if(ctx.index===2)return {stopPrice:105};if(ctx.index===3)return {stopPrice:90};return {};}`);
  const result=await run(strategy,bars);
  assert.equal(result.trades[0].exitTime,bars[4].time+14400);assert.equal(result.trades[0].exit,105);
});

test("limit and stop entries remain causal, can expire, and cannot exceed notional cap", async () => {
  const bars=Array.from({length:20},(_,i)=>bar(i));bars[4]={...bar(4),open:90,high:101,low:89,close:100};
  const limit=script(`function onBar(ctx){if(ctx.index===0)return {entry:{side:'long',type:'limit',price:95,stopDistance:20,riskPct:90}};if(ctx.position)return {exit:true};return {};}`);
  const result=await run(limit,bars);assert.equal(result.trades[0].entryTime,bars[4].time);assert.equal(result.trades[0].entry,90);assert.ok(result.trades[0].pnl<=10000/90*10+1e-9);
  const expired=script(`function onBar(ctx){if(ctx.index===0)return {entry:{side:'long',type:'limit',price:95,expiresAfterBars:2}};return {};}`);
  assert.equal((await run(expired,bars)).trades.length,0);
  const stop=script(`function onBar(ctx){if(ctx.index===0)return {entry:{side:'short',type:'stop',price:95,stopDistance:20}};return {};}`);
  assert.equal((await run(stop,bars)).trades[0].entry,90);
});

test("partial exits and supplied funding reconcile with ending equity", async () => {
  const bars=Array.from({length:20},(_,i)=>bar(i));
  const ds={...dataset(bars),funding:[{time:bars[2].time,rate:0.001,markPrice:100}]};
  const strategy=script(`function onBar(ctx){if(ctx.index===0)return {entry:{side:'long',stopDistance:10,riskPct:1}};if(ctx.index===2)return {exitPct:50};if(ctx.index===4)return {exit:true};return {};}`);
  const result=await runStrategyBacktest(ds,strategy,{capital:10000,feeBps:6,slippageBps:0,start:bars[0].time,end:bars.at(-1).time},"test","test");
  assert.equal(result.trades.length,2);assert.equal(result.metrics.totalFunding,1);
  const pnl=result.trades.reduce((sum,t)=>sum+t.pnl,0);
  assert.ok(Math.abs(result.curve.at(-1).equity-10000-pnl)<1e-8);
  assert.ok(Math.abs(pnl+result.metrics.totalFees+result.metrics.totalFunding)<1e-8);
});

test("unlisted actions are rejected, not silently ignored", async () => {
  const vm=await createScriptRuntime(script(`function onBar(ctx){return {buy:true};}`));
  try {assert.throws(()=>vm.step({bar:bar(0),index:0,symbol:'TEST',equity:10000,position:null,parameters:{}}),/Unknown strategy action/);}finally{vm.dispose();}
});

test("Adaptive Trend Breakout template runs with Wilder ATR and exposes editable parameters", async () => {
  const {adaptiveTrendStrategy}=await import('../lib/shared/strategy-examples.js');
  const bars=Array.from({length:500},(_,i)=>{const price=1000+Math.max(0,i-220)*5;return {...bar(i,price),high:price+2,low:price-2,close:price+1}});
  const result=await run(adaptiveTrendStrategy,bars);
  // Quiet history cannot pass the 0.5% filter; directional movement raises Wilder ATR above it.
  assert.ok(result.trades.length>0);
  assert.ok(result.trades[0].entryTime>=bars[221].time);
  assert.equal(result.trades[0].side,1);
  const prefix=await run(adaptiveTrendStrategy,bars.slice(0,350));
  assert.deepEqual(prefix.curve.slice(0,-1),result.curve.slice(0,349));
  await validateScriptStrategy(adaptiveTrendStrategy);
});

test("fixed round-trip fee is one dollar across partial exits and reconciles P/L", async()=>{
 const bars=Array.from({length:20},(_,i)=>bar(i));
 const strategy=script(`function onBar(ctx){if(ctx.index===0)return {entry:{side:'long',allocationPct:100}};if(ctx.index===2)return {exitPct:50};if(ctx.index===4)return {exit:true};return {};}`);
 const result=await run(strategy,bars,{feePerTrade:1,feeBps:999});
 assert.equal(result.metrics.totalFees,1);assert.equal(result.trades.length,2);
 assert.equal(result.curve.at(-1).equity,9999);
 assert.equal(result.trades.reduce((s,t)=>s+t.pnl,0),-1);
 assert.ok(result.curve[1].equity<=9999.5);
});
test("fixed fees in rule strategies are one dollar per completed trade",async()=>{
 const bars=Array.from({length:20},(_,i)=>bar(i));
 const rule={version:1,name:'Fees',description:'Fees',side:'long',entryLong:[{left:{kind:'close'},op:'gt',right:0}],entryShort:[],exitLong:[{left:{kind:'close'},op:'gt',right:0}],exitShort:[],stopLossPct:0,takeProfitPct:0,allocationPct:100};
 const result=await run(rule,bars,{feePerTrade:1,feeBps:999});
 assert.equal(result.metrics.totalFees,result.trades.length);
 assert.equal(result.trades.reduce((s,t)=>s+t.pnl,0),-result.metrics.totalFees);
 assert.equal(result.curve.at(-1).equity,10000-result.metrics.totalFees);
 await assert.rejects(run(rule,bars,{feePerTrade:-1}),/Fixed/);
});
