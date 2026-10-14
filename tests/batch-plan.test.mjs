import test from 'node:test';
import assert from 'node:assert/strict';
import {expandBatch} from '../lib/shared/batch-plan.js';
import {exampleStrategy} from '../lib/shared/types.js';
import {runBacktest} from '../lib/shared/engine.js';
const strategy={id:'s',name:'SMA',source:JSON.stringify(exampleStrategy)};
test('batch expansion freezes independent parameter/market/period snapshots and bounds work',()=>{
 const periods=[{start:'2025-01-01T00:00',end:'2025-02-01T00:00'},{start:'2025-03-01T00:00',end:'2025-04-01T00:00'}];
 const children=expandBatch(strategy,['BTC-USD','ETH-USD'],periods,'stopLossPct',[1,2]);assert.equal(children.length,8);
 assert.equal(JSON.parse(children[0].source).stopLossPct,1);assert.equal(JSON.parse(children[1].source).stopLossPct,2);assert.equal(JSON.parse(strategy.source).stopLossPct,1);
 assert.throws(()=>expandBatch(strategy,Array(8).fill('BTC-USD'),periods,'stopLossPct',[1,2]),/24/);assert.throws(()=>expandBatch(strategy,['BTC-USD'],[{start:'bad',end:'2025-01-01'}],'',[0]),/valid start/);
});
test('risk override sizes actual exposure and modeled spread is charged once per side',()=>{
 const bars=Array.from({length:24},(_,i)=>({time:1000+i*60,open:100,high:101,low:99,close:100,volume:1,spread:0}));
 const rules={...exampleStrategy,entryLong:[{left:{kind:'close'},op:'gt',right:1}],exitLong:[],stopLossPct:5,takeProfitPct:10};
 const data={id:'d',symbol:'T',fileName:'test.csv',bars,skipped:0,importedAt:0};const settings={capital:1000,feeBps:0,slippageBps:0,start:1000,end:2440};
 const run=runBacktest(data,rules,{...settings,riskPct:.5,spreadBps:10},'s','Risk');assert.equal(run.trades.length,1);assert.ok(Math.abs(run.trades[0].entry-100.05)<1e-10);assert.ok(Math.abs(run.trades[0].exit-99.95)<1e-10);assert.ok(Math.abs(run.trades[0].pnl+.09995002498750625)<1e-10);
 assert.throws(()=>runBacktest(data,rules,{...settings,riskPct:11},'s','bad'),/Risk/);
 assert.ok(Math.abs(run.trades[0].rMultiple-run.trades[0].pnl/5)<1e-10);
 assert.ok(run.warnings.some(w=>w.includes('10 bps spread')));
});
