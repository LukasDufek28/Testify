import test from 'node:test';
import assert from 'node:assert/strict';
import {dailySharpeEstimate} from '../lib/shared/performance.js';
const curve=values=>values.map((equity,i)=>({time:1735689600+i*86400,equity}));
test('daily Sharpe uses sample variability and exposes short samples rather than hiding all tests under 20 days',()=>{
 const estimate=dailySharpeEstimate(curve([100,110,99,108.9]));
 assert.ok(Math.abs(estimate.value-Math.sqrt(365/12))<1e-10);
 assert.equal(estimate.count,3);assert.equal(estimate.shortSample,true);
 const intraday=curve([100,110,99,108.9]).flatMap(point=>[{...point,equity:point.equity*.9}, {...point,time:point.time+3600}]);
 assert.deepEqual(dailySharpeEstimate(intraday),estimate);
});
test('Sharpe does not fabricate a value for constant returns, sparse dates, nonpositive equity or too few closes',()=>{
 for(const points of [curve([100,100,100]),curve([100,110,121]),curve([100,110]),curve([100,0,110]),curve([100,110,99]).map((p,i)=>({...p,time:p.time+(i===2?86400:0)})),[{time:NaN,equity:100}]])assert.equal(dailySharpeEstimate(points).value,null);
});
