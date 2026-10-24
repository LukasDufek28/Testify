import {selectWorkspaceOption} from './fixtures';
import {test,expect,clickWorkspaceButton} from './fixtures';
import {runBacktest} from '../../src/engine';
import {runStrategyBacktest} from '../../src/programmable-engine';
import {exampleStrategy} from '../../src/types';
const base=1735689600;
const bars=Array.from({length:300},(_,i)=>{const price=100+Math.sin(i/8)*8+i*.02;return {time:base+i*3600,open:price,high:price+1,low:price-1,close:price+.5,volume:100,spread:0};});
const dataset={id:'result-data',symbol:'BTC-USD',fileName:'test-candles.csv',importedAt:Date.now(),utcOffset:0,point:0,bars,skipped:0};
const strategy={...exampleStrategy,name:'Result strategy',entryLong:[{left:{kind:'close' as const},op:'gt' as const,right:0}],exitLong:[],stopLossPct:2,takeProfitPct:3};
const settings={capital:10000,feeBps:2,slippageBps:1,useMt5Spread:false,start:base,end:base+199*3600};
const a={...runBacktest(dataset,strategy,settings,'s','Run A'),id:'result-a',granularity:3600,datasetId:dataset.id,strategySource:JSON.stringify(strategy),research:{phase:'development' as const,fullStart:base,fullEnd:base+299*3600,boundary:settings.end,splitPct:60}};
const b={...runBacktest(dataset,{...strategy,takeProfitPct:4},{...settings,capital:20000,feeBps:3},'s','Run B'),id:'result-b',granularity:3600,datasetId:dataset.id,strategySource:JSON.stringify({...strategy,takeProfitPct:4}),research:a.research,createdAt:a.createdAt+1};
test.beforeEach(async({page})=>{
  await page.route('**/api/markets',route=>route.fulfill({json:{markets:[{id:'BTC-USD'},{id:'ETH-USD'}]}}));
  await page.goto('/#/app/history');await expect(page.getByRole('heading',{name:'Backtests',exact:true})).toBeVisible();
  await page.evaluate(async({dataset,a,b,strategy})=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('testify-user-e2e-user',1);req.onsuccess=()=>{const db=req.result;const tx=db.transaction(['runs','datasets','strategies'],'readwrite');tx.objectStore('runs').put(a);tx.objectStore('runs').put(b);tx.objectStore('datasets').put(dataset);tx.objectStore('strategies').put({id:'s',name:strategy.name,source:JSON.stringify(strategy),updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);});},{dataset,a,b,strategy});await page.reload();
});



async function openRun(page:any,name='Run A',details=true){
 await page.getByRole('button',{name:'View results for '+name,exact:true}).click();
 await expect(page).toHaveURL(/#\/app\/backtests$/);
 await expect(page.getByRole('heading',{name:'Backtests',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Backtest results',exact:true})).toHaveCount(0);
 if(details)await page.getByText('Run details & exports',{exact:false}).click();
}

test('saved results show all runs as a dashboard portfolio and default Backtests to the latest strategy',async({page})=>{
 await openRun(page,'Run A',false);await expect(page.locator('.design-result-context')).toContainText('Saved run · Run A');await expect(page.getByRole('button',{name:'Latest: Run B',exact:true})).toBeVisible();
 await clickWorkspaceButton(page,'Dashboard');await expect(page.locator('.design-main[aria-busy="false"]')).toBeVisible();
 const capital=a.settings.capital+b.settings.capital,profit=a.curve.at(-1)!.equity+b.curve.at(-1)!.equity-capital;
 await expect(page.locator('.design-metric').first()).toContainText('Combined · 2 saved runs');
 await expect(page.locator('.design-metric').first().locator('strong')).toHaveText(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(profit));
 await expect(page.locator('.design-portfolio-caption')).toContainText('$30,000 combined starting capital');await expect(page.locator('.design-latest')).toContainText('Result strategy');
 await expect(page.locator('.design-topbar')).not.toContainText('Saved workspace');await expect(page.locator('.design-topbar').getByRole('button',{name:'Saved backtests'})).toHaveCount(0);
 await clickWorkspaceButton(page,'Backtests');await expect(page.locator('.design-result-context')).toContainText('Latest run · Run B');await expect(page.locator('.design-page-heading')).toContainText('Result strategy · BTC-USD · 1h');
 await page.getByRole('button',{name:'Saved backtests',exact:true}).click();await openRun(page,'Run A',false);await page.getByRole('button',{name:'Latest: Run B',exact:true}).click();await expect(page.locator('.design-result-context')).toContainText('Latest run · Run B');
});

test('saved display timezone updates trade timestamps and their label immediately and after reload',async({page})=>{
 await openRun(page,'Run A',false);await clickWorkspaceButton(page,'Trades & chart');
 const firstEntry=page.locator('.design-trade-history tbody tr').first().locator('td').nth(0);
 await expect(page.locator('.design-bottom-note')).toContainText('Times shown in UTC');
 await clickWorkspaceButton(page,'Run backtest');await page.getByText('Saved defaults',{exact:true}).click();
 await selectWorkspaceOption(page,'Display timezone','Asia/Tokyo');await page.getByRole('button',{name:'Save current settings as defaults'}).click();await expect(page.getByRole('status').filter({hasText:'Defaults saved'})).toBeVisible();
 await clickWorkspaceButton(page,'Trades & chart');await expect(page.locator('.design-bottom-note')).toContainText('Times shown in Asia/Tokyo');
 const expected=new Date(a.trades[0].entryTime*1000).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'});
 await expect(firstEntry).toContainText(expected);await page.reload();await expect(page.locator('.design-bottom-note')).toContainText('Times shown in Asia/Tokyo');await expect(firstEntry).toContainText(expected);
});
test('assistant context includes an older selected run and excludes reserved validation',async({page})=>{
 await page.evaluate(async run=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('testify-user-e2e-user',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('runs','readwrite'),store=tx.objectStore('runs');for(let i=0;i<8;i++)store.put({...run,id:'newer-'+i,name:'Newer '+i,createdAt:run.createdAt+100+i});store.put({...run,id:'reserved',name:'Reserved',createdAt:run.createdAt+200,research:{...run.research,phase:'validation'}});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},a);
 await page.reload();await openRun(page,'Run A',false);
 let context:any;await page.route('**/api/assistant',r=>{context=r.request().postDataJSON().context;return r.fulfill({json:{answer:'Selected result reviewed.',actions:[],messages:[]}});});
 await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});
 await chat.getByLabel('Message AI assistant').fill('Explain this selected run');await chat.getByRole('button',{name:'Send assistant message'}).click();
 await expect(chat).toContainText('Selected result reviewed.');
 expect(context.selectedRunId).toBe('result-a');expect(context.runs).toHaveLength(5);
 expect(context.runs.map((r:any)=>r.id)).toContain('result-a');expect(context.runs.map((r:any)=>r.id)).not.toContain('reserved');
 expect(context.runs.find((r:any)=>r.id==='result-a').testedPeriod.end).toBe(new Date(a.settings.end*1000).toISOString());
});
test('small asset trade prices and measured risk levels remain readable after refresh',async({page})=>{
 const factor=.0000001;
 const small={...a,trades:a.trades.map(t=>({...t,entry:t.entry*factor,exit:t.exit*factor,stopLoss:t.stopLoss==null?t.stopLoss:t.stopLoss*factor,takeProfit:t.takeProfit==null?t.takeProfit:t.takeProfit*factor}))};
 await page.evaluate(async({run,data})=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('testify-user-e2e-user',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['runs','datasets'],'readwrite');tx.objectStore('runs').put(run);tx.objectStore('datasets').put(data);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{run:small,data:{...dataset,bars:bars.map(bar=>({...bar,open:bar.open*factor,high:bar.high*factor,low:bar.low*factor,close:bar.close*factor}))}});
 await page.reload();await openRun(page,'Run A',false);await clickWorkspaceButton(page,'Trades & chart');
 const prices=page.locator('.design-trade-detail dd');await expect(prices.first()).toContainText('$0.0000');
 await expect(prices.nth(1)).not.toHaveText('$0');await expect(prices.nth(2)).toContainText('$0.0000');
 const entry=await prices.first().textContent();await page.reload();await expect(prices.first()).toHaveText(entry!);
 expect(await page.locator('[aria-label="Trade replay candlestick chart"] text').allTextContents()).toContainEqual(expect.stringMatching(/e-5|e-6/));
});
test('saved results show real metrics, charts, snapshot settings and full trade exports',async({page})=>{
 await openRun(page);await expect(page.locator('.design-metric')).toHaveCount(3);await expect(page.locator('.responsive-equity-plot svg')).toBeVisible();
 await expect(page.locator('.design-run-simple')).toHaveCount(0);
 await expect(page.locator('.design-run-statistics')).toContainText(String(a.metrics.tradeCount));await expect(page.locator('.saved-settings')).toContainText('10,000');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export CSV',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe('Run-A-trades.csv');const content=await(await import('node:fs/promises')).readFile((await file.path())!,'utf8');expect(content.split('\r\n')).toHaveLength(a.trades.length+1);
 await page.getByRole('button',{name:'Use these settings',exact:true}).click();await clickWorkspaceButton(page,'Run backtest');await expect(page.getByLabel('Run name',{exact:true})).toHaveValue('Run A copy');await expect(page.getByLabel('Starting capital',{exact:true})).toHaveValue('10000');
 await page.getByRole('button',{name:'Saved backtests',exact:true}).click();await openRun(page);await page.reload();await page.getByText('Run details & exports',{exact:false}).click();await page.getByRole('button',{name:'Improve strategy',exact:true}).click();await expect(page.getByRole('heading',{name:'Strategy creation',exact:true})).toBeVisible();
});

test('short saved runs show a measured Sharpe estimate without rewriting their original snapshot',async({page})=>{
 await page.evaluate(async()=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('testify-user-e2e-user',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('runs','readwrite'),store=tx.objectStore('runs'),get=store.get('result-a');get.onsuccess=()=>store.put({...get.result,metrics:{...get.result.metrics,sharpe:null}});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});});await page.reload();
 await openRun(page,'Run A',false);const metric=page.locator('.design-metric').filter({hasText:'Sharpe ratio'});
 await expect(metric.locator('strong')).not.toHaveText('—');await expect(metric).toContainText('Estimate ·');await expect(metric).not.toContainText('Unavailable');
 await page.getByText('Run details & exports',{exact:false}).click();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export full run',exact:true}).click();const file=await downloading;const snapshot=JSON.parse(await(await import('node:fs/promises')).readFile((await file.path())!,'utf8'));expect(snapshot.metrics.sharpe).toBeNull();expect(snapshot.curve).toEqual(a.curve);
});
test('trade selection and filters use saved candles without network and paginate all trades',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/candles?**',r=>r.abort());await openRun(page,'Run A',false);await clickWorkspaceButton(page,'Trades & chart');
 await expect(page.locator('.design-candles')).toBeVisible();await expect(page.locator('[data-marker="entry"]')).toBeVisible();await page.getByRole('button',{name:'View trade 2',exact:true}).click();await expect(page.getByRole('heading',{name:'Selected trade · #2',exact:true})).toBeVisible();await expect(page.locator('.design-trade-detail')).toContainText(a.trades[1].reason);
 await page.getByRole('combobox',{name:'Trade direction',exact:true}).click();await page.getByRole('option',{name:'Short',exact:true}).click();await expect(page.getByText('No trades match these filters.',{exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Trade direction',exact:true}).click();await page.getByRole('option',{name:'All directions',exact:true}).click();await expect(page.locator('.design-trade-history tbody tr')).toHaveCount(Math.min(25,a.trades.length));if(a.trades.length>25){await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.design-trade-pagination')).toContainText('26–');}expect(errors).toEqual([]);
});

test('programmed trade review restores measured SL and TP and exports them after reload',async({page},testInfo)=>{
 const custom={version:3 as const,runtime:'javascript' as const,name:'Measured script',description:'Measured levels',code:"function onBar(ctx){if(ctx.index===0)return {entry:{side:'long',stopDistance:5,takeProfitPrice:125,riskPct:.5}};if(ctx.index===2)return {stopPrice:100};if(ctx.index===6)return {exit:true};return {}; }"};
 const measured={...await runStrategyBacktest(dataset,custom,settings,'s','Run A'),id:a.id,granularity:3600,datasetId:dataset.id,strategySource:JSON.stringify(custom),research:a.research};
 expect(measured.trades[0].stopLoss).toBe(100);expect(measured.trades[0].takeProfit).toBe(125);
 const older={...measured,id:b.id,name:'Run B',trades:measured.trades.map(({stopLoss:_,takeProfit:__,...trade})=>trade)};
 await page.evaluate(async runs=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('testify-user-e2e-user',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('runs','readwrite');for(const run of runs)tx.objectStore('runs').put(run);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}),[measured,older]);await page.reload();await openRun(page,'Run A',false);await clickWorkspaceButton(page,'Trades & chart');
 for(let step=0;step<2;step++){
  const detail=page.locator('.design-trade-detail');await expect(detail.getByRole('term').filter({hasText:/^Stop loss$/}).locator('..').locator('dd')).toHaveText('$100.00');await expect(detail.getByRole('term').filter({hasText:/^Take profit$/}).locator('..').locator('dd')).toHaveText('$125.00');await expect(page.locator('[data-level="SL"]')).toBeVisible();await expect(page.locator('[data-level="TP"]')).toBeVisible();if(step===0)await page.reload();
 }
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export trades',exact:true}).click();const file=await download,content=await(await import('node:fs/promises')).readFile((await file.path())!,'utf8');expect(content).toContain('Stop loss at exit');expect(content).toContain('"100","125"');
 expect(await page.locator('.design-trade-detail').evaluate(el=>el.getBoundingClientRect().bottom-el.querySelector('.design-trade-actions')!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(16);
 await page.screenshot({path:testInfo.outputPath('programmed-trade-levels.png'),fullPage:true});
 await page.getByRole('button',{name:'Saved backtests',exact:true}).click();await openRun(page,'Run B',false);await clickWorkspaceButton(page,'Trades & chart');await expect(page.locator('.design-trade-risk-note')).toContainText('not stored');await expect(page.locator('[data-level="SL"],[data-level="TP"]')).toHaveCount(0);
});


test('history filters and comparison retain context and export both runs',async({page})=>{
  await page.getByPlaceholder('Search runs or strategy names').fill('Run A');await expect(page.locator('.history-table tbody tr')).toHaveCount(1);await page.getByPlaceholder('Search runs or strategy names').fill('');await page.getByRole('checkbox',{name:'Select run Run A',exact:true}).check();await page.getByRole('checkbox',{name:'Select run Run B',exact:true}).check();await page.getByRole('button',{name:'Compare selected',exact:true}).click();await expect(page.getByRole('heading',{name:'Compare backtests',exact:true})).toBeVisible();await expect(page.locator('.comparison-page')).toContainText('different costs');await page.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Starting capital',exact:true})}).scrollIntoViewIfNeeded();await expect(page.locator('.comparison-table')).toContainText('20,000');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export comparison',exact:true}).click();expect((await download).suggestedFilename()).toBe('testify-comparison.csv');await page.reload();await expect(page.locator('.comparison-table')).toContainText('Run A');
});


test('results, trades, settings, history and compare resize without outer overflow',async({page})=>{
 await page.getByRole('checkbox',{name:'Select run Run A',exact:true}).check();await page.getByRole('checkbox',{name:'Select run Run B',exact:true}).check();await page.getByRole('button',{name:'Compare selected',exact:true}).click();
 for(const route of ['compare','history','results','trades','runsettings']){await page.goto('/#/app/'+route);await expect(page.getByRole('heading',{level:1})).toBeVisible();for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
});


test('cancelled online backtest preserves settings and saves no partial run',async({page})=>{
  await page.goto('/#/app/runsettings');await page.route('**/api/candles?**',async route=>{await new Promise(resolve=>setTimeout(resolve,1500));try{await route.fulfill({json:{bars}});}catch{/* Request was cancelled. */}});await page.getByRole('button',{name:'Start backtest',exact:true}).click();await expect(page.getByRole('heading',{name:'Running backtest',exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancel backtest',exact:true}).click();await expect(page.getByRole('heading',{name:'Run backtest',exact:true})).toBeVisible();await expect(page.locator('.design-notice')).toContainText('Backtest cancelled');await page.getByRole('button',{name:'Saved backtests',exact:true}).click();await expect(page.locator('.history-table tbody tr')).toHaveCount(2);
});



test('online run stores original candles for offline trade inspection after reload',async({page})=>{
 await openRun(page);await page.getByRole('button',{name:'Use these settings',exact:true}).click();await selectWorkspaceOption(page,"Market / dataset",'online');await page.route('**/api/candles?**',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({json:{bars:bars.filter(bar=>bar.time>=Number(q.get('start'))&&bar.time<=Number(q.get('end')))}});});await page.getByRole('button',{name:'Start backtest',exact:true}).click();await expect(page.locator('.design-notice')).toContainText('1 backtest saved');await expect(page).toHaveURL(/#\/app\/backtests$/);await page.route('**/api/candles?**',r=>r.abort());await page.reload();await clickWorkspaceButton(page,'Trades & chart');await expect(page.locator('[data-marker="entry"]')).toBeVisible();await page.getByRole('button',{name:'Saved backtests',exact:true}).click();await expect(page.locator('.history-table tbody tr')).toHaveCount(3);
});


test('failed run returns to configuration and preserves its settings',async({page})=>{
  await page.goto('/#/app/runsettings');await page.getByLabel('Run name',{exact:true}).fill('Preserve my test');await page.route('**/api/candles?**',route=>route.fulfill({status:503,json:{error:'Historical data temporarily unavailable'}}));await page.getByRole('button',{name:'Start backtest',exact:true}).click();await expect(page.locator('.design-error')).toContainText('Historical data temporarily unavailable');await expect(page.getByRole('heading',{name:'Run backtest',exact:true})).toBeVisible();await expect(page.getByLabel('Run name',{exact:true})).toHaveValue('Preserve my test');
});



test('only the headline balance counts up while secondary saved metrics stay still',async({page})=>{
 await page.clock.install();await openRun(page);await expect(page.locator('.design-metric [data-countup="true"]')).toHaveCount(1);await expect(page.locator('.design-run-statistics [data-countup="true"]')).toHaveCount(0);const secondary=await page.locator('.design-run-statistics').innerText();await page.clock.runFor(1800);await expect(page.locator('.design-run-statistics')).toHaveText(secondary,{useInnerText:true});
});
test('hovering equity retains both visible equity and drawdown colors and formats tooltip values',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await openRun(page,'Run A',false);const plot=page.locator('.responsive-equity-plot');await plot.scrollIntoViewIfNeeded();const box=(await plot.boundingBox())!;await page.mouse.move(box.x+box.width*.6,box.y+70);await expect(plot.locator('[data-chart="strategy"]')).toHaveAttribute('stroke',/url/);await expect(plot.locator('[data-chart="benchmark"]')).toHaveAttribute('stroke','#e69a9a');await expect(plot.locator('.responsive-equity-tooltip')).toContainText('$');await expect(plot.locator('.responsive-equity-tooltip')).toContainText('%');
});
test.describe('decimal formatting with a Slovak browser locale',()=>{
 test.use({locale:'sk-SK'});
 test('saved percentages keep dot decimals in the overview and run details',async({page})=>{
  await openRun(page);await expect(page.locator('.design-metric-value small').first()).toHaveText((a.metrics.netReturnPct>=0?'+':'')+a.metrics.netReturnPct.toFixed(2)+'%');await expect(page.locator('.design-run-statistics')).toContainText(a.metrics.netReturnPct.toFixed(2)+'%');
 });
});
test('dense history, comparison, trade details and settings never count up',async({page})=>{
 await expect(page.locator('.history-table [data-countup="true"]')).toHaveCount(0);await openRun(page);await expect(page.locator('.design-saved-run [data-countup="true"]')).toHaveCount(0);await clickWorkspaceButton(page,'Trades & chart');await expect(page.locator('.design-trade-history [data-countup="true"],.design-trade-detail [data-countup="true"]')).toHaveCount(0);await page.getByRole('button',{name:'Saved backtests',exact:true}).click();await page.getByRole('checkbox',{name:'Select run Run A',exact:true}).check();await page.getByRole('checkbox',{name:'Select run Run B',exact:true}).check();await page.getByRole('button',{name:'Compare selected',exact:true}).click();await expect(page.locator('.comparison-table')).toBeVisible();await expect(page.locator('[data-countup="true"]')).toHaveCount(0);
});


test('long monthly histories fill each row and keep positive and zero returns white',async({page})=>{
 const curve=Array.from({length:10},(_,i)=>({time:Date.UTC(2025,i,1)/1000,equity:10000+[0,266,104,200,-100,100,-400,-800,-800,-600][i]}));
 await page.evaluate(async curve=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('testify-user-e2e-user',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('runs','readwrite'),store=tx.objectStore('runs'),read=store.get('result-a');read.onsuccess=()=>store.put({...read.result,curve});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},curve);
 await page.reload();await openRun(page);
 await expect(page.locator('.monthly-returns article')).toHaveCount(10);
 for(const width of [390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  const geometry=await page.locator('.monthly-returns').evaluate(el=>{const parent=el.getBoundingClientRect();const rows=new Map<number,{left:number;right:number}>();for(const child of el.children){const box=child.getBoundingClientRect();const row=rows.get(box.top);rows.set(box.top,{left:Math.min(row?.left??Infinity,box.left),right:Math.max(row?.right??0,box.right)});}return {left:parent.left,right:parent.right,rows:[...rows.values()]};});
  for(const row of geometry.rows){expect(Math.abs(row.left-geometry.left)).toBeLessThan(2);expect(Math.abs(row.right-geometry.right)).toBeLessThan(2);}
 }
 const values=await page.locator('.monthly-returns .animated-value').evaluateAll(elements=>elements.map(el=>({value:el.getAttribute('aria-label')!,color:getComputedStyle(el).color})));
 for(const value of values){if(value.value.startsWith('+'))expect(value.color).toBe('rgb(255, 255, 255)');else expect(value.color).not.toBe('rgb(255, 255, 255)');}
});


test('short monthly histories use centered columns instead of stretching across the dashboard card',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const count of [1,2,3,7]){
  const curve=Array.from({length:count},(_,i)=>({time:Date.UTC(2025,i,15)/1000,equity:10000+(i+1)*100}));
  await page.evaluate(async run=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('testify-user-e2e-user',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('runs','readwrite');tx.objectStore('runs').put(run);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{...b,curve});
  await page.goto('/#/app/overview');await page.reload();
  const row=page.locator('.design-monthly-bars');
  await expect(row.getByRole('button')).toHaveCount(count);
  for(const width of [390,1440,2560]){
   await page.setViewportSize({width,height:1000});
   const geometry=await row.evaluate(el=>{const parent=el.getBoundingClientRect(),bars=[...el.children].map(child=>child.getBoundingClientRect());return {parentWidth:parent.width,parentCenter:parent.x+parent.width/2,left:bars[0].left,right:bars.at(-1)!.right,widths:bars.map(box=>box.width)};});
   expect(Math.abs((geometry.left+geometry.right)/2-geometry.parentCenter)).toBeLessThan(1);
   expect(Math.max(...geometry.widths)).toBeLessThan(100);
   if(count===1)expect(geometry.right-geometry.left).toBeLessThan(geometry.parentWidth/2);
  }
 }
});



test('approved equity and drawdown stay readable as the overview resizes',async({page})=>{
 await openRun(page,'Run A',false);const plot=page.locator('.responsive-equity-plot');for(const width of [390,768,1440,1920]){await page.setViewportSize({width,height:900});await expect.poll(()=>plot.evaluate(el=>{const svg=el.querySelector('svg')!,view=svg.viewBox.baseVal;return Math.abs(view.width-el.clientWidth)<2;})).toBe(true);expect(await plot.locator('text').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(10);const box=(await plot.boundingBox())!;expect(box.height).toBeGreaterThan(200);}
});

test('equity axis distinguishes small moves around the starting balance',async({page})=>{
 const curve=Array.from({length:20},(_,i)=>({time:base+i*3600,equity:10000+Math.sin(i)*150}));
 await page.evaluate(async run=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('testify-user-e2e-user',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('runs','readwrite');tx.objectStore('runs').put(run);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}),{...a,curve});await page.reload();await openRun(page,'Run A',false);
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});const labels=page.locator('[data-axis="equity"]');await expect(labels).toHaveCount(4);const text=await labels.allTextContents();expect(new Set(text).size).toBe(4);const values=text.map(label=>Number(label.replace(/,/g,'').replace(/k$/,''))*(label.endsWith('k')?1000:1));expect(values.every((value,i)=>i===0||value<values[i-1])).toBe(true);
  await expect.poll(()=>labels.evaluateAll(elements=>elements.every(el=>{const box=(el as SVGGraphicsElement).getBBox(),svg=el.closest('svg')!;return box.x>=0&&box.x+box.width<svg.viewBox.baseVal.width;}))).toBe(true);
 }
});
test('summary cards keep their proportions in centered ultrawide workspaces',async({page})=>{
 await openRun(page,'Run A',false);let font=0;for(const width of [390,1440,2560,3440]){await page.setViewportSize({width,height:1440});const layout=await page.locator('.design-main').evaluate(el=>({width:el.getBoundingClientRect().width,cards:[...el.querySelectorAll('.design-metric')].map(card=>card.getBoundingClientRect().width),font:parseFloat(getComputedStyle(el.querySelector('.design-metric strong')!).fontSize)}));expect(layout.width).toBeLessThanOrEqual(1142);if(width>=1440)expect(Math.max(...layout.cards)-Math.min(...layout.cards)).toBeLessThan(1);if(width===1440)font=layout.font;if(width===3440)expect(layout.font).toBeCloseTo(font,0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});


test('Penpot replay reads stored candles, plots saved risk levels and exports actual trades',async({page})=>{
 await page.route('**/api/candles?**',route=>route.abort());
 await page.goto('/#/app/trades');
 await expect(page.getByRole('heading',{name:'Selected trade · #1',exact:true})).toBeVisible();
 await expect(page.getByRole('slider',{name:'Replay position'})).toBeEnabled();
 const range=page.getByRole('slider',{name:'Replay position'});
 await range.press('End');
 await expect(page.locator('[data-marker="entry"]')).toBeVisible();
 await expect(page.locator('[data-marker="exit"]')).toBeVisible();
 await expect(page.locator('[data-level="SL"]')).toBeVisible();
 await expect(page.locator('[data-level="TP"]')).toBeVisible();
 const details=page.locator('.design-trade-detail');
 await expect(details.locator('dl>div').filter({hasText:'Stop loss'})).toContainText((b.trades[0].entry*.98).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}));
 await page.getByRole('button',{name:'Next trade',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Selected trade · #2',exact:true})).toBeVisible();
 await expect.poll(async()=>Number(await range.inputValue())).toBeGreaterThan(1);await range.press('Home');
 await expect(page.getByRole('button',{name:'Previous trade',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Next bar',exact:true}).click();await expect(range).toHaveValue('2');
 await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await expect.poll(()=>range.inputValue()).not.toBe('2');await page.getByRole('button',{name:'Pause',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export trades',exact:true}).click();
 const file=await download,content=await(await import('node:fs/promises')).readFile((await file.path())!,'utf8');
 expect(content.split('\r\n')).toHaveLength(b.trades.length+1);expect(content).toContain(new Date(b.trades[0].exitTime*1000).toISOString());
 await page.reload();await expect(page.getByRole('heading',{name:'Trades & chart',exact:true})).toBeVisible();
});
