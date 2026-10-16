import {test,expect} from './fixtures';
import {exampleStrategy} from '../../src/types';
test.beforeEach(async({page})=>{await page.route('**/api/markets',r=>r.fulfill({json:{markets:[]}}));});
test('approved studio stays fluid, uses matching tabs and scrolls without crashes',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#/app/studio');
 await expect(page.getByRole('heading',{name:'Strategy creation',exact:true})).toBeVisible();
 await expect(page.locator('.monaco-editor')).toBeVisible({timeout:20000});
 for(const width of [320,390,560,768,960,1024,1280,1440,1920,3440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(await page.locator('.editor-wrap').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(400);
  await page.getByRole('button',{name:'Ask assistant',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Ask assistant',exact:true})).toBeVisible();
 }
 await page.setViewportSize({width:1440,height:900});expect(await page.locator('.view-lines span').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).color==='rgb(249, 249, 250)'))).toBe(true);const bounds=await page.locator('.design-studio-grid > section').evaluateAll(els=>els.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));expect(bounds).toHaveLength(1);expect(bounds[0].width).toBe(1142);expect(bounds[0].height).toBeGreaterThanOrEqual(610);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('strategy-studio-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath('strategy-studio-mobile.png'),fullPage:true});
 await expect(page.locator('.design-studio-assistant')).toHaveCount(0);expect(errors).toEqual([]);
});
test('manual editing validates, rejects malformed JSON and saves across reload',async({page})=>{
 await page.goto('/#/app/studio');await expect(page.locator('.monaco-editor')).toBeVisible({timeout:20000});
 const editor=page.locator('.monaco-editor textarea.inputarea');const selectAll=async()=>{await editor.press((await page.evaluate(()=>navigator.userAgent)).includes('Macintosh')?'Meta+A':'Control+A');};await selectAll();await editor.press('Backspace');await editor.pressSequentially('{bad');await page.getByRole('button',{name:'Validate',exact:true}).click();await expect(page.locator('.design-error')).toBeVisible();
 await selectAll();await editor.press('Backspace');await editor.pressSequentially(JSON.stringify({...exampleStrategy,name:'Manual studio strategy'}));await page.getByRole('button',{name:'Validate',exact:true}).click();await expect(page.locator('.design-notice')).toContainText('Strategy format is valid');
 await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.design-studio-toolbar h2')).toHaveText('Manual studio strategy');await page.reload();await expect(page.locator('.design-studio-toolbar h2')).toHaveText('Manual studio strategy');
 await page.locator('.strategy-panel summary').click();await expect(page.locator('.strategy-list button')).toHaveCount(1);
 await page.getByRole('button',{name:'New strategy',exact:true}).click();await expect(page.locator('.design-studio-toolbar h2')).toHaveText('New draft');await page.locator('.strategy-list button').click();await expect(page.locator('.design-studio-toolbar h2')).toHaveText('Manual studio strategy');
});
test('editor opens the single assistant and keeps its unsaved draft through a recoverable provider error',async({page})=>{
 await page.goto('/#/app/studio');await page.getByRole('button',{name:'Ask assistant',exact:true}).click();const chat=page.getByRole('dialog',{name:'AI assistant'});await expect(chat).toBeVisible();await expect(page.locator('.design-studio-assistant')).toHaveCount(0);
 await page.route('**/api/assistant',r=>r.fulfill({status:503,json:{error:'Assistant unavailable'}}));await chat.getByLabel('Message AI assistant').fill('Create a crossover');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat.getByRole('alert')).toContainText('Assistant unavailable');await expect(chat.getByRole('button',{name:'Try again'})).toBeEnabled();await expect(page.locator('.design-studio-toolbar h2')).toHaveText('New draft');
});

test('mobile editor supports touch-style editing, validation and saving',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#/app/studio');
 const editor=page.locator('.design-mobile-code');await editor.fill(JSON.stringify({...exampleStrategy,name:'Mobile draft'},null,2));await page.getByRole('button',{name:'Validate',exact:true}).click();await expect(page.locator('.design-notice')).toContainText('Strategy format is valid');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.design-studio-toolbar h2')).toHaveText('Mobile draft');await page.reload();await expect(editor).toHaveValue(/Mobile draft/);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
import {runBacktest} from '../../src/engine';
test('Improve uses selected development results and keeps the revision unsaved',async({page})=>{
 const start=1735689600;const bars=Array.from({length:100},(_,i)=>({time:start+i*3600,open:100+i,high:102+i,low:99+i,close:101+i,volume:100,spread:0}));
 const dataset={id:'studio-data',symbol:'BTC-USD',fileName:'studio.csv',bars,importedAt:Date.now(),utcOffset:0,point:0,skipped:0};
 const run={...runBacktest(dataset,exampleStrategy,{capital:10000,feeBps:0,slippageBps:0,useMt5Spread:false,start,end:start+59*3600},'studio-s','Studio development'),id:'studio-run',granularity:3600,strategySource:JSON.stringify(exampleStrategy),research:{phase:'development',fullStart:start,fullEnd:start+99*3600,boundary:start+60*3600,splitPct:60}};
 await page.goto('/#/app/studio');await expect(page.locator('.monaco-editor')).toBeVisible();
 await page.evaluate(async({run,strategy})=>{await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('testify-user-e2e-user',1);request.onsuccess=()=>{const db=request.result;const tx=db.transaction(['strategies','runs'],'readwrite');tx.objectStore('strategies').put({id:'studio-s',name:strategy.name,source:JSON.stringify(strategy,null,2),updatedAt:Date.now()});tx.objectStore('runs').put(run);tx.objectStore('runs').put({...run,id:'holdout',name:'Reserved holdout',research:{...run.research,phase:'validation'}});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});},{run,strategy:exampleStrategy});await page.reload();
 let received:any;await page.route('**/api/generate-strategy',r=>{received=r.request().postDataJSON();return r.fulfill({json:{strategy:{...exampleStrategy,name:'Revised studio draft'},model:'test'}});});
 let calls=0;await page.route('**/api/assistant',r=>{calls++;return r.fulfill({json:calls===1?{answer:'',actions:[{id:'revise-1',name:'revise_strategy',input:{instructions:'Reduce drawdown'}}],messages:[{role:'assistant',content:[{type:'tool-call',toolCallId:'revise-1',toolName:'revise_strategy',input:{instructions:'Reduce drawdown'}}]}]}:{answer:'The revision is ready. Review and save it.',actions:[],messages:[]}});});
 await page.getByRole('button',{name:'Ask assistant',exact:true}).click();const chat=page.getByRole('dialog',{name:'AI assistant'});await chat.getByLabel('Message AI assistant').fill('Reduce drawdown');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat).toContainText('The revision is ready.');expect(received.mode).toBe('revise');expect(received.results).toHaveLength(1);expect(received.results[0].phase).toBe('development');await expect(page.locator('.strategy-diff')).toContainText('Revised studio draft');await expect(page.locator('.design-studio-toolbar h2')).toHaveText(exampleStrategy.name);await page.reload();await expect(page.locator('.view-lines')).toContainText(exampleStrategy.name);
});
