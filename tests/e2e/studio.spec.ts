import {test,expect,clickWorkspaceButton,type Page} from './fixtures';
import {exampleStrategy} from '../../src/types';
test.beforeEach(async({page})=>{await page.route('**/api/markets',r=>r.fulfill({json:{markets:[]}}));});

async function editMobileDraft(page:Page,name:string){
 await page.setViewportSize({width:390,height:844});await page.goto('/#/app/studio');const editor=page.locator('.design-mobile-code');await expect(editor).toBeVisible();await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled();await editor.fill(JSON.stringify({...exampleStrategy,name},null,2));return editor;
}

for(const leave of [false,true])test(`motion save and run ${leave?'respects navigation while saving':'opens setup with the acknowledged strategy and never starts a test automatically'}`,async({page})=>{
 const name='Acknowledged draft',editor=await editMobileDraft(page,name);let release=()=>{},writes=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/strategies',async route=>{if(route.request().method()==='PUT'){writes++;await gate;}await route.fallback();});
 try{
  const run=page.getByRole('button',{name:'Run',exact:true});await expect(run).toHaveText('Save & run');await run.click();await expect(run).toHaveAttribute('aria-busy','true');await expect(editor).toHaveJSProperty('readOnly',true);await expect(page.getByRole('button',{name:'New strategy',exact:true})).toBeDisabled();await expect(page.locator('.studio-save-status')).toContainText('Saving');await expect.poll(()=>writes).toBe(1);
  if(leave)await clickWorkspaceButton(page,'Data');release();
  if(leave){await expect(page.getByRole('status').filter({hasText:'Saved '+name})).toBeVisible();await expect(page).toHaveURL(/#\/app\/data$/);}else{await expect(page).toHaveURL(/#\/app\/runsettings$/);await expect(page.getByRole('combobox',{name:'Strategy',exact:true})).toContainText(name);}
  await clickWorkspaceButton(page,'Strategies');const card=page.locator('.strategy-card').filter({hasText:name});await expect(card).toContainText('Not tested');await expect.poll(()=>writes).toBe(1);await page.reload();await expect(page.locator('.strategy-card')).toHaveCount(1);await expect(card).toContainText('Not tested');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{release();}
});

test('motion editor keyboard save uses the latest rules once and keeps one saved strategy across revisions',async({page})=>{
 const editor=await editMobileDraft(page,'Keyboard first');let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),writes:any[]=[];
 await page.route('**/api/strategies',async route=>{if(route.request().method()==='PUT'){writes.push(route.request().postDataJSON());if(writes.length===1)await gate;}await route.fallback();});
 try{
  await editor.press('Control+s');await expect(page.getByRole('button',{name:'Save',exact:true})).toHaveAttribute('aria-busy','true');await editor.press('Control+s');await expect.poll(()=>writes.length).toBe(1);release();await expect(page.locator('.studio-save-status')).toContainText('Saved');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
  await editor.fill(JSON.stringify({...exampleStrategy,name:'Keyboard latest'},null,2));await expect(page.locator('.studio-save-status')).toContainText('Unsaved changes');await editor.press('Control+s');await expect(page.locator('.studio-save-status')).toContainText('Saved · v2');expect(writes).toHaveLength(2);expect(JSON.parse(writes[1].source).name).toBe('Keyboard latest');expect(writes[0].id).toBe(writes[1].id);
  await page.reload();await expect(editor).toHaveValue(/Keyboard latest/);await expect(page.locator('.studio-save-status')).toContainText('Saved · v2');
 }finally{release();}
});

test('motion a failed save keeps the AI proposal available for review and retry',async({page})=>{
 await editMobileDraft(page,'Before proposal');let calls=0,fail=true;
 await page.route('**/api/assistant',route=>{calls++;const input={instructions:'Create a draft',save:false};return route.fulfill({json:calls===1?{answer:'',actions:[{id:'proposed',name:'create_strategy',input}],messages:[{role:'assistant',content:[{type:'tool-call',toolCallId:'proposed',toolName:'create_strategy',input}]}]}:{answer:'The draft is ready.',actions:[]}});});
 await page.route('**/api/generate-strategy',route=>route.fulfill({json:{strategy:{...exampleStrategy,name:'Recoverable proposal'},model:'test'}}));
 await page.route('**/api/strategies',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{error:'Save temporarily unavailable'}}):route.fallback());
 await page.getByRole('button',{name:'Ask assistant',exact:true}).click();const chat=page.getByRole('dialog',{name:'AI assistant'});await chat.getByLabel('Message AI assistant').fill('Draft my next strategy');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat.getByRole('article',{name:'Assistant response'})).toContainText('The draft is ready.');await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);
 const proposal=page.locator('.strategy-diff');await expect(proposal).toContainText('Recoverable proposal');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.design-error')).toContainText('Save temporarily unavailable');await expect(proposal).toBeVisible();await expect(page.locator('.design-mobile-code')).toHaveValue(/Recoverable proposal/);
 fail=false;await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.studio-save-status')).toContainText('Saved');await expect(proposal).toHaveCount(0);await page.reload();await expect(page.locator('.design-mobile-code')).toHaveValue(/Recoverable proposal/);await expect(page.locator('.design-studio-toolbar h2')).toHaveText('Recoverable proposal');
});
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
