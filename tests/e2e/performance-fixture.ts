import type {Page} from '@playwright/test';
import {runBacktest} from '../../src/engine';
import {exampleStrategy} from '../../src/types';

// A calculated fixture is installed explicitly by chart-interaction tests.
// An empty workspace must never supply a preview curve on their behalf.
export async function savePerformanceFixture(page:Page){
 const start=1735689600;
 const bars=Array.from({length:240},(_,i)=>{const open=100+i*.1+Math.sin(i/12)*8;return {time:start+i*3600,open,high:open+2,low:open-2,close:open+.3,volume:20};});
 const dataset={id:'chart-fixture-data',symbol:'BTC-USD',fileName:'fixture.csv',importedAt:1,bars,skipped:0};
 const run={...runBacktest(dataset,exampleStrategy,{capital:10000,start,end:start+240*3600,feeBps:2,slippageBps:1},'chart-fixture-strategy','Chart interaction fixture'),strategySource:JSON.stringify(exampleStrategy),granularity:3600,datasetId:dataset.id};
 await expectWorkspace(page);
 await page.evaluate(async record=>{const response=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Testify-Session':'e2e-session'},body:JSON.stringify({kind:'runs',record})});if(!response.ok)throw new Error('Could not save chart test fixture');},run);
}
async function expectWorkspace(page:Page){await page.getByText('Saved workspace',{exact:true}).waitFor();}
