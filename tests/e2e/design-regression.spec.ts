import {test,expect} from '@playwright/test';
import {exampleStrategy} from '../../src/types';
const profit='rgb(255, 255, 255)', drawdown='rgb(255, 255, 255)', orange='rgb(242, 132, 47)', blue='rgb(69, 91, 138)';
test.beforeEach(async({page})=>{await page.route('**/api/markets',r=>r.fulfill({json:{markets:[{id:'BTC-USD'}]}}));});
test('landing preview keeps profits and drawdowns white while neutral metrics stay white',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.landing-metrics .positive')).toHaveCSS('color',profit);
 await expect(page.locator('.landing-metrics .negative')).toHaveCSS('color',drawdown);
 await expect(page.locator('.landing-metrics > div').nth(2).locator('strong')).toHaveCSS('color','rgb(255, 255, 255)');
});
test('strategy and dashboard hover states retain orange and blue through real hover',async({page})=>{
 await page.goto('/#/app/studio');
 for(const name of ['Save','Generate new draft']) {const button=page.getByRole('button',{name,exact:true});await expect(button).toHaveCSS('background-color',orange);await button.hover();await expect(button).toHaveCSS('background-color',orange);await expect(button).toHaveCSS('color','rgb(255, 255, 255)');}
 const validate=page.getByRole('button',{name:'Validate',exact:true});await validate.hover();await expect(validate).toHaveCSS('background-color',blue);
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.strategy-panel summary').click();const saved=page.locator('.strategy-list button');await saved.hover();await expect(saved).toHaveCSS('background-color',blue);
});
test('returning dashboard matches the design sections and keeps gains and drawdowns white',async({page})=>{
 await page.goto('/#/app/overview');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await page.evaluate(async(strategy)=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('testify-local-v1',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['runs','strategies'],'readwrite');tx.objectStore('strategies').put({id:'s',name:strategy.name,source:JSON.stringify(strategy),updatedAt:1});for(const [id,value] of [['gain',12],['loss',-2]] as const)tx.objectStore('runs').put({id,name:id,createdAt:id==='gain'?2:1,symbol:'BTC-USD',strategyId:'s',strategyName:strategy.name,granularity:3600,settings:{start:1735689600,end:1735776000},metrics:{netReturnPct:value,maxDrawdownPct:3,tradeCount:2},curve:[],trades:[],warnings:[]});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},exampleStrategy);
 await page.reload();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await expect(page.locator('.dashboard-summary article')).toHaveCount(4);
 await expect(page.getByText('Saved snapshot',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'View results for gain',exact:true})).toBeVisible();
 for(const heading of ['Continue working','Ready to test?','Recent backtests'])await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
 await expect(page.locator('.dashboard-summary .positive')).toHaveText('+12.0%');await expect(page.locator('.dashboard-summary .positive')).toHaveCSS('color',profit);
 await expect(page.getByRole('cell',{name:'-2.0%',exact:true})).toHaveCSS('color',drawdown);
 await expect(page.locator('.dashboard-summary article').nth(3).locator('strong')).toHaveCSS('color',drawdown);
 expect(await page.locator('.hero').count()).toBe(0);
 for(const width of [390,1024,1366,1920]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.getByRole('button',{name:'Create strategy',exact:true}).hover();await expect(page.getByRole('button',{name:'Create strategy',exact:true})).toHaveCSS('background-color',orange);
 await page.getByRole('button',{name:`Open strategy ${exampleStrategy.name}`,exact:true}).click();await expect(page.getByRole('heading',{name:'Strategy creation',exact:true})).toBeVisible();
});
test('backtest progress advances with loaded candles, estimates remaining time and saves a real result',async({page})=>{
 await page.goto('/#/app/strategies');await page.locator('input[type=file]').setInputFiles({name:'s.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});await expect(page.locator('.strategy-card')).toHaveCount(1);
 await page.evaluate(()=>localStorage.setItem('testify-tester-options-v1',JSON.stringify({start:'2025-01-01T00:00',end:'2025-10-01T00:00',splitPct:70,granularity:3600})));
 await page.goto('/#/app/backtests');
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let requests=0;
 await page.route('**/api/candles?**',async route=>{const url=new URL(route.request().url());requests++;if(requests===2)await gate;const start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end'));await route.fulfill({json:{bars:Array.from({length:Math.ceil((end-start)/3600)},(_,i)=>({time:start+i*3600,open:100+i*.01,high:102+i*.01,low:99+i*.01,close:101+i*.01,volume:100,spread:0}))}});});
 await page.getByRole('button',{name:'Run backtest',exact:true}).click();const bar=page.getByRole('progressbar',{name:'Backtest processing'});await expect(bar).toBeVisible();await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);const value=Number(await bar.getAttribute('aria-valuenow'));expect(value).toBeLessThan(70);await expect(page.getByText(/remaining · estimate/)).toBeVisible();await expect(bar.locator('span')).toHaveCSS('animation-name','none');
 release();await expect(page.getByRole('heading',{name:'Backtest results',exact:true})).toBeVisible({timeout:20000});await page.reload();await expect(page.getByRole('heading',{name:'Backtest results',exact:true})).toBeVisible();
});

test('sidebar selection has a short turning marker and hover never replaces the active page',async({page})=>{
 await page.goto('/#/app/data');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 const active=page.getByRole('button',{name:'Data',exact:true});
 await expect(active).toHaveAttribute('aria-current','page');
 const marker=await active.locator('.nav-selection-marker').evaluate(el=>{const css=getComputedStyle(el);return {color:css.borderLeftColor,animation:css.animationName,duration:css.animationDuration};});
 expect(marker.color).toBe(orange);expect(marker.animation).toBe('nav-marker-turn');expect(marker.duration).toBe('0.48s');
 await page.getByRole('button',{name:'Backtests',exact:true}).hover();await expect(active).toHaveCSS('background-color',blue);await expect(page.locator('nav [aria-current]')).toHaveCount(1);
 await page.getByRole('button',{name:'Backtests',exact:true}).click();await expect(page.getByRole('button',{name:'Backtests',exact:true})).toHaveAttribute('aria-current','page');await expect(active).not.toHaveAttribute('aria-current','page');
 await expect(page.locator('nav [aria-current] .nav-selection-marker')).toHaveClass(/marker-right/);await expect.poll(()=>page.locator('nav [aria-current] .nav-selection-marker').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m11)).toBeCloseTo(-1,3);await page.getByRole('button',{name:'Data',exact:true}).click();await expect(page.locator('nav [aria-current] .nav-selection-marker')).toHaveClass(/marker-left/);await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('nav [aria-current] .nav-selection-marker').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
