import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualSession,advanceManual,manualResult,validateManualOrder} from '../lib/shared/manual-engine.js';
import {runBacktest} from '../lib/shared/engine.js';
import {exampleStrategy} from '../lib/shared/types.js';
const bars=Array.from({length:24},(_,i)=>({time:1000+i*60,open:90,high:91,low:89,close:90,volume:100,spread:0}));
bars[0]={...bars[0],open:100,high:101,low:99,close:100};bars[1]={...bars[0],time:1060};bars[2]={...bars[0],time:1120,open:105,high:112,low:94,close:94};
const dataset={id:'fixture',symbol:'TEST-USD',fileName:'fixture.csv',bars,skipped:0,importedAt:0};
const strategy={...exampleStrategy,entryLong:[{left:{kind:'close'},op:'gt',right:95}],exitLong:[],stopLossPct:5,takeProfitPct:10,allocationPct:10};
const saved={id:'saved',name:strategy.name,source:JSON.stringify(strategy)};
const settings={capital:1000,feeBps:0,slippageBps:0,start:1000,end:bars.at(-1).time};
const order={side:1,type:'market',price:100,stop:95,target:110,riskPct:.5};
test('manual orders fill on the next candle and match automatic fills with stop-first ambiguity',()=>{
 let state=createManualSession(dataset,saved,settings,'Manual');state=advanceManual(state,dataset,{type:'order',order});assert.equal(state.position,null);assert.equal(state.cursor,0);
 state=advanceManual(state,dataset,{type:'step'});assert.equal(state.position.entryTime,1060);assert.equal(state.position.units,1);
 state=advanceManual(state,dataset,{type:'step'});assert.equal(state.trades[0].exit,95);assert.equal(state.trades[0].pnl,-5);assert.equal(state.trades[0].reason,'Stop loss');
 const automatic=runBacktest(dataset,strategy,settings,'saved','Auto');assert.equal(automatic.trades.length,1);
 for(const key of ['entry','exit','entryTime','exitTime','pnl'])assert.equal(state.trades[0][key],automatic.trades[0][key]);
 const result=manualResult(advanceManual(state,dataset,{type:'finish'}),dataset);assert.equal(result.metrics.netReturnPct,-.5000000000000004);assert.equal(result.metrics.totalFees,0);
 assert.equal(result.mode,'manual');assert.equal(result.settings.end,1180);
});
test('saved manual state resumes exactly, future candles cannot alter revealed output, and pending orders can be edited/cancelled',()=>{
 let s=createManualSession(dataset,saved,{...settings,feeBps:2,slippageBps:1},'Resume');s=advanceManual(s,dataset,{type:'order',order});
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(advanceManual(restored,dataset,{type:'step'}),advanceManual(s,dataset,{type:'step'}));
 const changed={...dataset,bars:dataset.bars.map((bar,i)=>i>2?{...bar,high:10000,close:10000}:bar)};
 assert.deepEqual(advanceManual(s,changed,{type:'step'}),advanceManual(s,dataset,{type:'step'}));
 s=advanceManual(s,dataset,{type:'edit',stop:96,target:111});assert.equal(s.pending.stop,96);s=advanceManual(s,dataset,{type:'cancel'});assert.equal(s.pending,null);
 assert.throws(()=>validateManualOrder({...order,riskPct:0},100),/risk/);assert.throws(()=>validateManualOrder({...order,stop:101},100),/stop/);
});
