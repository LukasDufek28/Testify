import {test,expect,clickWorkspaceButton,selectWorkspaceOption} from './fixtures';
import {exampleStrategy} from '../../src/types';

test('assistant greets on the first turn with compact bubbles and truthful streamed activity',async({page})=>{
 await page.goto('/#/app/overview');
 const launcher=page.getByRole('button',{name:'Open AI assistant',exact:true});await launcher.hover();await expect(launcher.locator('.assistant-launcher-label')).toHaveCSS('opacity','0.85');
 await launcher.focus();await expect(launcher.locator('.assistant-launcher-label')).toHaveCSS('opacity','0.85');
 let requests=0;
 await page.route('**/api/assistant',async r=>{requests++;expect(r.request().headers().accept).toBe('text/event-stream');await r.fulfill({contentType:'text/event-stream',body:'event: activity\ndata: {"text":"Preparing a reply…"}\n\nevent: result\ndata: {"answer":"Hey! What would you like to work on?","actions":[]}\n\n'});});
 await launcher.click();const chat=page.getByRole('dialog',{name:'AI assistant'});await chat.getByLabel('Message AI assistant').fill('yo');await chat.getByRole('button',{name:'Send assistant message'}).click();
 await expect(chat.getByRole('article',{name:'Assistant response'})).toHaveText('Hey! What would you like to work on?');expect(requests).toBe(1);await expect(chat).not.toContainText('Reading your workspace');
 const bubble=chat.getByRole('article',{name:'Your message'});expect((await bubble.boundingBox())!.width).toBeLessThan(65);await expect(bubble).toHaveCSS('white-space','pre-wrap');
 await chat.getByRole('button',{name:'Expand assistant'}).click();await expect.poll(async()=>(await bubble.boundingBox())!.width).toBeLessThan(65);
});

test('assistant keeps a failed first reply visible beside the composer and retries without duplicating the question',async({page})=>{
 await page.route('**/api/assistant',r=>r.fulfill({contentType:'text/event-stream',body:'event: error\ndata: {"error":"The reply was interrupted. Try again."}\n\n'}));
 await page.goto('/#/app/overview');await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});
 await chat.getByLabel('Message AI assistant').fill('hello');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat.getByRole('alert')).toBeInViewport();await expect(chat.getByRole('button',{name:'Try again'})).toBeInViewport();
 await page.route('**/api/assistant',r=>r.fulfill({json:{answer:'Hello! I’m here.',actions:[]}}));await chat.getByRole('button',{name:'Try again'}).click();await expect(chat.getByRole('article',{name:'Assistant response'})).toHaveText('Hello! I’m here.');await expect(chat.getByRole('article',{name:'Your message'})).toHaveCount(1);await expect(chat.getByRole('alert')).toHaveCount(0);
});

test('assistant keeps an interrupted conversation readable after reload without silently replaying actions',async({page})=>{
 await page.goto('/#/app/overview');await page.evaluate(()=>localStorage.setItem('testify-assistant-v1:e2e-user',JSON.stringify([{role:'user',text:'hello'}])));await page.reload();
 let calls=0;await page.route('**/api/assistant',r=>{calls++;return r.fulfill({json:{answer:'I’m here. What would you like to do?',actions:[]}});});
 await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});await expect(chat.getByRole('status')).toContainText('previous reply was interrupted');expect(calls).toBe(0);
 await chat.getByLabel('Message AI assistant').fill('Are you there?');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat.getByRole('article',{name:'Assistant response'})).toContainText('I’m here.');await expect(chat.locator('.assistant-notice')).toHaveCount(0);
});

test('assistant keeps timed-out stream activity from overwriting the next reply',async({page})=>{
 await page.addInitScript(()=>{
  const originalFetch=window.fetch,originalTimeout=AbortSignal.timeout.bind(AbortSignal);let shortened=false;
  AbortSignal.timeout=ms=>{if(ms===60000&&!shortened){shortened=true;return originalTimeout(100);}return originalTimeout(ms);};
  (window as any).qaStreams=[];
  window.fetch=(input,init)=>{
   if(String(input).includes('/api/assistant'))return Promise.resolve(new Response(new ReadableStream({start(controller){(window as any).qaStreams.push(controller);}}),{headers:{'Content-Type':'text/event-stream'}}));
   return originalFetch(input,init);
  };
 });
 await page.goto('/#/app/overview');await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});
 await chat.getByLabel('Message AI assistant').fill('First question');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat.getByRole('alert')).toContainText('took too long');
 await chat.getByLabel('Message AI assistant').fill('Second question');await chat.getByRole('button',{name:'Send assistant message'}).click();await page.waitForFunction(()=>(window as any).qaStreams.length===2);
 await page.evaluate(()=>{(window as any).qaStreams[0].enqueue(new TextEncoder().encode('event: activity\ndata: {"text":"Reading your workspace…"}\n\n'));});
 await expect(chat.locator('.assistant-activity')).toHaveText('Preparing a reply…');
 await page.evaluate(()=>{const streams=(window as any).qaStreams;streams[1].enqueue(new TextEncoder().encode('event: result\ndata: {"answer":"The second reply is ready.","actions":[]}\n\n'));streams[1].close();streams[0].close();});
 await expect(chat.getByRole('article',{name:'Assistant response'})).toHaveText('The second reply is ready.');await expect(chat.getByRole('alert')).toHaveCount(0);
});

test('assistant grows beside the launcher with a fixed bottom edge and unscaled content',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/#/app/overview');
 const launcher=page.getByRole('button',{name:'Open AI assistant',exact:true});await expect(launcher).toBeVisible();const origin=(await launcher.boundingBox())!;await launcher.click();
 const chat=page.getByRole('dialog',{name:'AI assistant'});await expect.poll(async()=>Math.round((await chat.boundingBox())!.height)).toBe(343);
 const opened=(await chat.boundingBox())!;expect(opened.x).toBeGreaterThan(origin.x+origin.width);expect(Math.abs(opened.y+opened.height-origin.y-origin.height)).toBeLessThan(1);await expect(chat.locator('.assistant-chat')).toHaveCSS('transform','none');
 await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);await expect(launcher).toBeFocused();expect((await launcher.boundingBox())!.y).toBe(origin.y);
});

test('assistant formats readable answers without speaker prefixes and returns to its single launcher',async({page})=>{
 await page.route('**/api/assistant',r=>r.fulfill({json:{answer:'**Your result**\n\nNet profit is **$193.28**.\n\n- Risk: **1%**\n- Review fees before the next run.\n\nUse `stopLossPct` to adjust the stop.\n\n[Guide](https://example.com/guide)\n\n<script>window.chatInjected=true</script>\n\n[Unsafe](javascript:alert(1))',actions:[],messages:[]}}));
 await page.goto('/#/app/overview');await expect(page.locator('.assistant-entry,.design-studio-assistant')).toHaveCount(0);
 await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});
 await expect(page.getByRole('button',{name:'Open AI assistant',exact:true})).toHaveCount(0);
 await chat.getByLabel('Message AI assistant').fill('Explain my results.');await chat.getByRole('button',{name:'Send assistant message'}).click();
 const answer=chat.getByRole('article',{name:'Assistant response'});await expect(answer.locator('strong')).toHaveText(['Your result','$193.28','1%']);await expect(answer.locator('li')).toHaveCount(2);await expect(answer.locator('p')).toHaveCount(5);await expect(answer.locator('code')).toHaveText('stopLossPct');
 await expect(chat.getByRole('article',{name:'Your message'})).toHaveText('Explain my results.');await expect(chat).not.toContainText('AI assistant:');await expect(chat).not.toContainText('You:');await expect(answer.locator('script,img')).toHaveCount(0);expect(await answer.getByRole('link',{name:'Unsafe'}).getAttribute('href')).not.toContain('javascript:');
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});expect(await answer.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
 await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);await expect(page.getByRole('button',{name:'Open AI assistant',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open AI assistant',exact:true}).click();await expect(page.getByRole('article',{name:'Assistant response'})).toContainText('$193.28');
});
test('global chat applies settings, runs the real engine on the backtest page, and keeps history across navigation',async({page})=>{
  await page.goto('/#/app/strategies');await page.getByLabel('Import strategy JSON file').setInputFiles({name:'s.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});await expect(page.locator('.strategy-card')).toHaveCount(1);
  await page.goto('/#/app/overview');
  let requests=0;const contexts:any[]=[];
  await page.route('**/api/assistant',r=>{requests++;const input=r.request().postDataJSON();contexts.push(input.context);
    const name=requests===1?'update_settings':'run_backtest';const args=requests===1?{capital:5000,feeBps:3,slippageBps:2}:{};const id='tool-'+requests;
    return r.fulfill({json:requests<3?{answer:'',actions:[{id,name,input:args}],messages:[{role:'assistant',content:[{type:'tool-call',toolCallId:id,toolName:name,input:args}]}]}:{answer:'Your backtest is saved. It used $5,000 starting capital, 3 bps fees and 2 bps slippage.',actions:[],messages:[]}});
  });
  await page.route('**/api/candles?**',r=>{const url=new URL(r.request().url());const start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end'));return r.fulfill({json:{bars:Array.from({length:Math.ceil((end-start)/3600)},(_,i)=>{const p=100+Math.sin(i/8)*10;return {time:start+i*3600,open:p,high:p+2,low:p-2,close:p+1,volume:100,spread:0};})}});});
  await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant',exact:true});
  await chat.getByLabel('Message AI assistant').fill('Set starting capital to 5000, fees to 3 bps, slippage to 2 bps, then run my strategy.');await chat.getByRole('button',{name:'Send assistant message'}).click();
  await expect(page.getByRole('heading',{name:'Backtests',exact:true})).toBeVisible({timeout:30000});await expect(chat).toContainText('Your backtest is saved.');expect(requests).toBe(3);const measured=contexts[2].runs[0];expect(measured.testedPeriod.end).toBe(new Date(measured.settings.end*1000).toISOString());expect(Date.parse(measured.testedPeriod.end)).toBeLessThan(Date.parse(contexts[2].settings.end));expect(contexts[1].settings.capital).toBe(5000);expect(contexts[1].settings.feeBps).toBe(3);
  await expect(chat.getByRole('progressbar')).toHaveCount(0);await expect(chat.getByText(/\d+% complete/)).toHaveCount(0);
  await clickWorkspaceButton(page,'Data');await expect(chat).toBeVisible();await expect(chat).toContainText('Your backtest is saved.');
  await chat.getByRole('button',{name:'Expand assistant'}).click();await expect.poll(async()=>(await chat.boundingBox())!.width).toBeGreaterThan(Math.min(400,page.viewportSize()!.width-25));await chat.getByRole('button',{name:'Minimize assistant'}).click();await expect.poll(async()=>Math.round((await chat.boundingBox())!.width)).toBe(290);
  await page.reload();await clickWorkspaceButton(page,'Open AI assistant');await expect(page.getByRole('dialog',{name:'AI assistant'})).toContainText('Your backtest is saved.');
});
test('assistant explains without generating strategies and recovers from an API error',async({page})=>{
  await page.goto('/#/app/overview');let generation=0;await page.route('**/api/generate-strategy',r=>{generation++;return r.fulfill({status:500,json:{error:'Unexpected generation'}});});
  await page.route('**/api/assistant',r=>r.fulfill({status:503,json:{error:'Temporarily unavailable'}}));await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});await chat.getByRole('button',{name:'Explain drawdown',exact:true}).click();await expect(chat.getByRole('alert')).toContainText('Temporarily unavailable');
  await page.route('**/api/assistant',r=>r.fulfill({json:{answer:'Drawdown is the decline from an equity peak. No saved result is available yet.',actions:[],messages:[]}}));await chat.getByRole('button',{name:'Try again',exact:true}).click();await expect(chat).toContainText('No saved result is available yet.');expect(generation).toBe(0);
  await page.setViewportSize({width:390,height:844});await expect(chat).toBeVisible();const bounds=(await chat.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
});

test('retry resumes completed actions and follow-ups retain their results without duplicating a saved strategy',async({page})=>{
 let requests=0,generations=0,saves=0;const inputs:any[]=[];
 await page.route('**/api/generate-strategy',r=>{generations++;return r.fulfill({json:{strategy:{...exampleStrategy,name:'Retry checkpoint'},model:'test'}});});
 page.on('request',request=>{if(request.url().endsWith('/api/strategies')&&request.method()==='PUT')saves++;});
 await page.route('**/api/assistant',r=>{
  const body=r.request().postDataJSON();inputs.push(body);requests++;
  if(requests===1)return r.fulfill({json:{answer:'',actions:[{id:'save-once',name:'create_strategy',input:{instructions:'Create and save Retry checkpoint',save:true}}],messages:[
   {role:'assistant',content:[{type:'tool-call',toolCallId:'read-1',toolName:'read_context',input:{}}]},
   {role:'tool',content:[{type:'tool-result',toolCallId:'read-1',toolName:'read_context',output:{type:'json',value:body.context}}]},
   {role:'assistant',content:[{type:'tool-call',toolCallId:'save-once',toolName:'create_strategy',input:{instructions:'Create and save Retry checkpoint',save:true}}]}
  ]}});
  if(requests===2)return r.fulfill({status:503,json:{error:'Reply interrupted'}});
  return r.fulfill({json:{answer:requests===3?'Saved **Retry checkpoint** once.':'The saved version is still available.',actions:[],messages:[]}});
 });
 await page.goto('/#/app/strategies');await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});
 await chat.getByLabel('Message AI assistant').fill('Create and save Retry checkpoint');await chat.getByRole('button',{name:'Send assistant message'}).click();
 await expect(chat.getByRole('alert')).toContainText('Reply interrupted');await chat.getByRole('button',{name:'Try again'}).click();await expect(chat).toContainText('Saved Retry checkpoint once.');
 expect(generations).toBe(1);expect(saves).toBe(1);await expect(chat.getByRole('article',{name:'Your message'})).toHaveCount(1);
 const toolResults=(body:any)=>body.messages.filter((m:any)=>m.role==='tool').flatMap((m:any)=>m.content);
 expect(toolResults(inputs[2])).toEqual([expect.objectContaining({toolName:'create_strategy',output:expect.objectContaining({value:expect.objectContaining({success:true,name:'Retry checkpoint'})})})]);
 expect(JSON.stringify(inputs[2].messages)).not.toContain('read_context');
 await chat.getByLabel('Message AI assistant').fill('Which version did you save?');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat).toContainText('The saved version is still available.');
 expect(toolResults(inputs[3])).toHaveLength(1);expect(saves).toBe(1);
 await chat.getByRole('button',{name:'Close assistant'}).click();await page.goto('/#/app/strategies');await expect(page.locator('.strategy-card')).toHaveCount(1);
});

test('Stop ends a waiting reply and leaves the assistant usable for the next message',async({page})=>{
 let requests=0;let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/assistant',async r=>{requests++;if(requests===1){await waiting;await r.fulfill({json:{answer:'This cancelled answer must stay hidden.',actions:[],messages:[]}}).catch(()=>{});}else await r.fulfill({json:{answer:'Ready for the next question.',actions:[],messages:[]}});});
 await page.goto('/#/app/overview');await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});
 await chat.getByLabel('Message AI assistant').fill('Explain this');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect.poll(()=>requests).toBe(1);
 await chat.getByRole('button',{name:'Stop assistant'}).click();await expect(chat).toContainText('Response stopped.');await expect(chat.getByRole('button',{name:'Try again'})).toHaveCount(0);
 release();await chat.getByLabel('Message AI assistant').fill('Try another question');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat).toContainText('Ready for the next question.');await expect(chat).not.toContainText('This cancelled answer');
});

test('stopping during an action keeps its result and skips the remaining queued actions',async({page})=>{
 let started=false,release:()=>void=()=>{},requests=0;const waiting=new Promise<void>(resolve=>{release=resolve;});const bodies:any[]=[];
 await page.route('**/api/generate-strategy',async r=>{started=true;await waiting;return r.fulfill({json:{strategy:{...exampleStrategy,name:'Completed before stopping'},model:'test'}});});
 await page.route('**/api/assistant',r=>{requests++;const body=r.request().postDataJSON();bodies.push(body);const actions=[{id:'draft',name:'create_strategy',input:{instructions:'Draft a strategy',save:false}},{id:'capital',name:'update_settings',input:{capital:1234}}];return r.fulfill({json:requests===1?{answer:'',actions,messages:[{role:'assistant',content:actions.map(a=>({type:'tool-call',toolCallId:a.id,toolName:a.name,input:a.input}))}]}:{answer:'The draft was kept. Capital was not changed.',actions:[],messages:[]}});});
 await page.goto('/#/app/overview');await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});
 await chat.getByLabel('Message AI assistant').fill('Draft a strategy then change capital to 1234');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect.poll(()=>started).toBe(true);await chat.getByRole('button',{name:'Stop assistant'}).click();release();await expect(chat).toContainText('Stopped. Completed changes are kept.');
 await chat.getByLabel('Message AI assistant').fill('What changed?');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat).toContainText('Capital was not changed.');
 expect(bodies[1].context.settings.capital).toBe(10000);const outputs=bodies[1].messages.filter((m:any)=>m.role==='tool').flatMap((m:any)=>m.content);expect(outputs).toHaveLength(2);expect(outputs[1].output.value.cancelled).toBe(true);
});

test('long messages grow within the chat without hiding the send button',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#/app/overview');await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'}),input=chat.getByLabel('Message AI assistant');
 const before=(await input.boundingBox())!.height;await input.fill('Describe the strategy rules.\nExplain the entry.\nExplain the exit.\nExplain risk and drawdown.\nKeep the answer readable.');await expect.poll(async()=>(await input.boundingBox())!.height).toBeGreaterThan(before);
 expect((await input.boundingBox())!.height).toBeLessThanOrEqual(90);await expect(chat.getByRole('button',{name:'Send assistant message'})).toBeInViewport();expect(await chat.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('creating an AI draft leaves saved strategies untouched until Save',async({page})=>{
 await page.goto('/#/app/strategies');await page.getByLabel('Import strategy JSON file').setInputFiles({name:'s.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});await expect(page.locator('.strategy-card')).toHaveCount(1);
 let calls=0;await page.route('**/api/assistant',r=>{calls++;return r.fulfill({json:calls===1?{answer:'',actions:[{id:'draft-1',name:'create_strategy',input:{instructions:'Draft a new strategy',save:false}}],messages:[{role:'assistant',content:[{type:'tool-call',toolCallId:'draft-1',toolName:'create_strategy',input:{instructions:'Draft a new strategy',save:false}}]}]}:{answer:'The editable draft is ready. Review and Save when you are happy with it.',actions:[],messages:[]}});});
 await page.route('**/api/generate-strategy',r=>r.fulfill({json:{strategy:{...exampleStrategy,name:'Unsaved proposal'},model:'test'}}));await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});await chat.getByLabel('Message AI assistant').fill('Draft a new strategy for me');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat).toContainText('The editable draft is ready.');await chat.getByRole('button',{name:'Close assistant'}).click();await expect(page.getByRole('heading',{name:'Strategy creation',exact:true})).toBeVisible();await expect(page.locator('.design-studio-toolbar')).toContainText('New draft');await expect(page.getByRole('button',{name:'Run',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Save',exact:true}).click();await page.goto('/#/app/strategies');await expect(page.locator('.strategy-card')).toHaveCount(2);await expect(page.locator('.strategy-card').filter({hasText:exampleStrategy.name})).toHaveCount(1);
});

test('assistant switches between fixed commission and percentage fees without retaining the old cost mode',async({page})=>{
 await page.goto('/#/app/overview');let calls=0;const contexts:any[]=[];
 await page.route('**/api/assistant',r=>{const body=r.request().postDataJSON();contexts.push(body.context);calls++;const input=calls===1?{feeMode:'fixed',feePerTrade:4}:{feeBps:6};return r.fulfill({json:calls%2?{answer:'',actions:[{id:'cost-'+calls,name:'update_settings',input}],messages:[{role:'assistant',content:[{type:'tool-call',toolCallId:'cost-'+calls,toolName:'update_settings',input}]}]}:{answer:'Costs updated.',actions:[],messages:[]}});});
 await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});await chat.getByLabel('Message AI assistant').fill('Use a fixed commission of 4 dollars per trade.');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat).toContainText('Costs updated.');expect(contexts[1].settings.feeMode).toBe('fixed');expect(contexts[1].settings.feePerTrade).toBe(4);await expect(page.getByLabel('Fee (basis points)',{exact:true})).toBeDisabled();
 await chat.getByLabel('Message AI assistant').fill('Change the fee to 6 basis points.');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect.poll(()=>calls).toBe(4);expect(contexts[3].settings.feeMode).toBe('percentage');expect(contexts[3].settings.feeBps).toBe(6);await expect(page.getByLabel('Fee (basis points)',{exact:true})).toBeEnabled();
});

test('assistant selects data sources and reports the updated dataset and test period in follow-ups',async({page})=>{
 await page.goto('/#/app/data');const rows=Array.from({length:72},(_,i)=>`${1735689600+i*3600},100,101,99,100,20`);await page.getByLabel('Import historical CSV file').setInputFiles({name:'assistant-source.csv',mimeType:'text/csv',buffer:Buffer.from('time,open,high,low,close,volume\n'+rows.join('\n'))});await expect(page.locator('.workspace-table tbody tr')).toHaveCount(1);
 await clickWorkspaceButton(page,'Run backtest');await selectWorkspaceOption(page,'Market / dataset',{label:'BTC-USD · assistant-source.csv'});const start=await page.getByLabel('Start',{exact:true}).inputValue();let calls=0;const contexts:any[]=[];
 await page.route('**/api/assistant',r=>{const body=r.request().postDataJSON();contexts.push(body.context);calls++;const input={datasetId:calls===1?'online':body.context.datasets.find((d:any)=>d.name==='assistant-source.csv').id};return r.fulfill({json:calls%2?{answer:'',actions:[{id:'source-'+calls,name:'update_settings',input}],messages:[{role:'assistant',content:[{type:'tool-call',toolCallId:'source-'+calls,toolName:'update_settings',input}]}]}:{answer:'Data source updated.',actions:[],messages:[]}});});
 await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});await chat.getByLabel('Message AI assistant').fill('Switch to online market data.');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat).toContainText('Data source updated.');expect(contexts[1].settings.datasetId).toBe('online');
 await chat.getByLabel('Message AI assistant').fill('Switch back to assistant-source.csv and its dates.');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect.poll(()=>calls).toBe(4);expect(contexts[3].settings.datasetId).not.toBe('online');expect(contexts[3].settings.start).toBe(start);await expect(page.getByRole('combobox',{name:'Market / dataset',exact:true})).toContainText('assistant-source.csv');
});
