import {test,expect,clickWorkspaceButton} from './fixtures';
import {exampleStrategy} from '../../src/types';

test('fresh accounts show no sample strategies, returns, trades or portfolio curves',async({page})=>{
  const writes:string[]=[];
  page.on('request',r=>{if(r.method()!=='GET'&&/\/api\/(strategies|workspace)/.test(r.url()))writes.push(r.url());});
  for(const route of ['overview','strategies','backtests','trades','portfolio','history','data']){
    await page.goto('/#/app/'+route);
    await expect(page.locator('.penpot-workspace')).toBeVisible();
    await expect(page.locator('.design-main[aria-busy="false"]')).toBeVisible();
    await expect(page.locator('.design-main')).not.toContainText(/BTC trend crossover|ETH breakout|RNBW-USD|42,480|12,480|33\.33%|Preview data/);
    await expect(page.locator('.strategy-card,.responsive-equity-plot,.design-monthly-bars button,.design-trade-history')).toHaveCount(0);
    if(route==='overview'||route==='backtests')await expect(page.locator('.design-metric-value strong')).toHaveText(['—','—','—']);
    if(route==='strategies'){await expect(page.getByRole('heading',{name:'Your first idea belongs here'})).toBeVisible();await expect(page.locator('.design-library-count')).toContainText('0');}
    if(route==='trades')await expect(page.getByRole('heading',{name:'No trades to review yet'})).toBeVisible();
  }
  expect(writes).toEqual([]);
  await page.reload();await expect(page.locator('.workspace-empty-copy')).toContainText('No datasets yet');
});

test('sidebar highlights only the current section and uses a workflow strategy icon',async({page})=>{
  await page.setViewportSize({width:1440,height:950});
  await page.goto('/#/app/overview');
  for(const label of ['Strategies','Data','Backtests','Dashboard']){
    await clickWorkspaceButton(page,label);
    const top=page.locator('.design-sidebar nav > button');
    await expect(top.locator('[aria-current=page]')).toHaveCount(0);
    await expect(page.locator('.design-sidebar nav > button[aria-current=page]')).toHaveCount(1);
    for(const button of await top.all()){
      const active=await button.getAttribute('aria-current')==='page';
      await expect(button.locator('.design-icon')).toHaveCSS('background-color',active?'rgb(249, 249, 250)':'rgb(43, 42, 51)');
    }
  }
  await expect(page.getByRole('button',{name:'Strategies',exact:true}).locator('svg.lucide-workflow')).toHaveCount(1);
});

test('data and overview actions share the same controls and card glares',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/#/app/backtests');
  const appearance=async(selector:string)=>page.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundImage,radius:s.borderRadius,height:s.minHeight,font:s.font,padding:s.padding,border:s.borderWidth};});
  const expected=await appearance('.design-overview-action [aria-label="Configure backtest"]');
  const heading=await page.getByRole('heading',{level:1}).evaluate(el=>{const s=getComputedStyle(el);return {font:s.fontSize,lineHeight:s.lineHeight,color:s.color};});
  await clickWorkspaceButton(page,'Data');
  expect(await page.getByRole('heading',{level:1}).evaluate(el=>{const s=getComputedStyle(el);return {font:s.fontSize,lineHeight:s.lineHeight,color:s.color};})).toEqual(heading);
  expect(await appearance('.workspace-page-heading button')).toEqual(expected);
  expect(await appearance('.csv-actions .dashboard-button')).toEqual(expected);
  const panel=page.locator('.workspace-panel').first();
  expect(await panel.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('radial-gradient');
  expect(await panel.evaluate(el=>getComputedStyle(el,'::before').maskComposite)).toContain('exclude');
  for(const width of [3440,1440,800,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});

test('selected strategy checkmark remains centered inside its own checkbox',async({page})=>{
  await page.goto('/#/app/strategies');
  await page.getByLabel('Import strategy JSON file').setInputFiles({name:'checkbox.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});
  const checkbox=page.getByRole('checkbox',{name:`Select ${exampleStrategy.name}`,exact:true});
  await checkbox.check();await expect(checkbox).toBeChecked();
  const mark=await checkbox.evaluate(el=>{const s=getComputedStyle(el,'::after');return {position:s.position,top:s.top,left:s.left,width:s.width,height:s.height};});
  expect(mark).toEqual({position:'static',top:'auto',left:'auto',width:'5px',height:'9px'});
  await expect(checkbox).toHaveCSS('width','20px');
  await checkbox.uncheck();await expect(checkbox).not.toBeChecked();
});

test('workspace read failures show recovery instead of an empty account or fake results',async({page})=>{
  await page.route('**/api/strategies',r=>r.fulfill({status:503,json:{error:'Database temporarily unavailable'}}));
  await page.goto('/#/app/overview');
  await expect(page.getByRole('alert')).toContainText('Database temporarily unavailable');
  await expect(page.locator('.design-metrics,.responsive-equity-plot')).toHaveCount(0);
  await page.route('**/api/strategies',r=>r.fulfill({json:{strategies:[]}}));
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByText('Your performance starts here',{exact:true})).toBeVisible();
});
