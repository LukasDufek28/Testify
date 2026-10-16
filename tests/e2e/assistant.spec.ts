import {test,expect,clickWorkspaceButton} from './fixtures';
import {exampleStrategy} from '../../src/types';

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
  await expect(page.getByRole('heading',{name:'Backtest results',exact:true})).toBeVisible({timeout:30000});await expect(chat).toContainText('Your backtest is saved.');expect(requests).toBe(3);expect(contexts[1].settings.capital).toBe(5000);expect(contexts[1].settings.feeBps).toBe(3);
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
