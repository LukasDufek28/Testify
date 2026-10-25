import {test,expect} from './fixtures';
import {savePerformanceFixture} from './performance-fixture';

test('single run setup is linked from Overview and replaces its duplicate form',async({page})=>{
 await page.goto('/#/app/backtests');await expect(page.locator('.design-run-simple')).toHaveCount(0);
 await page.getByRole('button',{name:'Configure backtest',exact:true}).click();await expect(page.getByRole('heading',{name:'Run backtest',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Start backtest',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Run settings',exact:true})).toHaveCount(0);
 await expect(page.locator('.design-research-tools')).not.toHaveAttribute('open','');
 const checkbox=page.getByRole('checkbox',{name:'BTC-USD',exact:true});await expect(checkbox).toHaveCSS('appearance','none');await expect(checkbox).toHaveCSS('width','18px');
 expect(await page.locator('html').evaluate(el=>getComputedStyle(el).scrollbarColor)).toBe('rgb(69, 68, 79) rgba(0, 0, 0, 0)');
});

test('library cards reflow without a full-width jump or overlapping header actions',async({page})=>{
 const {exampleStrategy}=await import('../../src/types');await page.goto('/#/app/strategies');await page.getByLabel('Import strategy JSON file').setInputFiles({name:'s.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});
 for(const width of [1920,1600,1440,1280,1100,800,560,390,320]){
  await page.setViewportSize({width,height:950});const card=page.locator('.strategy-card');await expect(card).toBeVisible();expect((await card.boundingBox())!.width).toBeLessThanOrEqual(561);
  const create=(await page.getByRole('button',{name:'Create strategy',exact:true}).boundingBox())!,upload=(await page.getByRole('button',{name:'Import strategy',exact:true}).boundingBox())!;
  expect(create.x+create.width<=upload.x+1||create.y+create.height<=upload.y+1).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('equity reveals once in view and keeps its drawn state during hover and resize',async({page})=>{
 await page.goto('/');
 const line=page.locator('[data-chart="strategy"]');
 const reveal=page.locator('[data-chart="reveal"]');
 await expect(reveal).toHaveAttribute('width',/^0(?:px)?$/);
 const plot=page.locator('.responsive-equity-plot');await plot.scrollIntoViewIfNeeded();
 await expect(reveal).toHaveAttribute('width',/^740(?:px)?$/);
 // A normalized dash and non-scaling stroke paint only part of a stretched path.
 await expect(line).toHaveCSS('stroke-dasharray','none');
 await plot.hover({position:{x:300,y:80}});
 await expect(reveal).toHaveAttribute('width',/^740(?:px)?$/);
 for(const width of [1920,390]){await page.setViewportSize({width,height:844});await expect(reveal).toHaveAttribute('width',/^740(?:px)?$/);await expect(line).toHaveCSS('stroke-dasharray','none');}
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
 // Reduced motion draws the final curve even before scrolling to the showcase.
 await expect(reveal).toHaveAttribute('width',/^740(?:px)?$/);
});

test('late loaded strategy cards animate once and remain visible after filtering',async({page})=>{
 await page.goto('/#/app/strategies');
 const {exampleStrategy}=await import('../../src/types');
 await page.getByLabel('Import strategy JSON file').setInputFiles({name:'late.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});
 const card=page.locator('.strategy-card');await expect(card).toHaveCount(1);
 await expect(card).toHaveCSS('opacity','1');await expect(card).toHaveCSS('translate','0px');
 await page.getByRole('searchbox',{name:'Search strategies',exact:true}).fill('missing');await expect(card).toHaveCount(0);
 await page.getByRole('searchbox',{name:'Search strategies',exact:true}).fill('');await expect(card).toHaveCSS('opacity','1');
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect(card).toHaveCSS('opacity','1');
});

test('static cards tilt slightly with a mouse, settle on leave, and stay flat for touch and reduced motion',async({page})=>{
 await page.goto('/#/app/overview');
 const card=page.locator('.design-metric').first();await card.scrollIntoViewIfNeeded();
 const rotation=()=>card.evaluate(el=>{const matrix=new DOMMatrix(getComputedStyle(el).transform);return Math.abs(matrix.m13)+Math.abs(matrix.m23);});
 await card.hover({position:{x:200,y:20}});
 await expect.poll(rotation).toBeGreaterThan(.001);
 expect(await rotation()).toBeLessThan(.04);
 await page.mouse.move(0,0);await expect.poll(rotation).toBeLessThan(.0001);
 await card.dispatchEvent('pointermove',{pointerType:'touch',clientX:200,clientY:20});await expect.poll(rotation).toBeLessThan(.0001);
 await page.getByRole('button',{name:'Open AI assistant',exact:true}).click();const assistant=page.locator('.assistant-chat');await assistant.hover({position:{x:20,y:20}});
 expect(await assistant.evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return Math.abs(m.m13)+Math.abs(m.m23);})).toBeLessThan(.0001);
 await page.emulateMedia({reducedMotion:'reduce'});await card.hover({position:{x:200,y:20}});await expect(card).toHaveCSS('transform','none');
});

test('account popup opens above the profile, closes with Escape or outside click, and offers motion and sign-out controls',async({page})=>{
 await page.goto('/#/app/overview');
 const trigger=page.getByRole('button',{name:'Open account menu',exact:true});
 await expect(page.getByRole('menuitem',{name:'Sign out'})).toHaveCount(0);
 await trigger.click();const menu=page.getByRole('menu',{name:'Account menu',exact:true});
 await expect(menu).toBeVisible();await expect(menu.getByText('adam@example.test',{exact:true})).toBeVisible();
 await expect(menu.getByRole('menuitem')).toHaveCount(1);
 await expect(menu.getByRole('menuitemcheckbox',{name:/Animations/})).toHaveCount(1);
 await expect(menu.getByRole('menuitem',{name:'Sign out'})).toBeFocused();
 const box=(await menu.boundingBox())!,button=(await trigger.boundingBox())!;
 expect(box.y+box.height).toBeLessThan(button.y);
 await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused();
 await page.keyboard.press('ArrowDown');await expect(menu).toBeVisible();
 await page.getByRole('heading',{level:1}).click();await expect(menu).toHaveCount(0);
 await page.getByRole('button',{name:'Open AI assistant',exact:true}).click();const input=page.getByRole('textbox',{name:'Message AI assistant',exact:true});await input.focus();await input.fill('Check this idea');
 await expect(input).toHaveCSS('outline-style','none');
 expect(await input.evaluate(el=>getComputedStyle(el.closest('form')!).outlineStyle)).toBe('none');
});

test('workspace content keeps approved width and centers beside the sidebar on wide screens',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const route of ['overview','backtests','strategies','runsettings','trades']) {
  await page.goto('/#/app/'+route);
  for(const width of [1920,2560,3440]) {
   await page.setViewportSize({width,height:1000});
   const geometry=await page.locator('.design-main').evaluate(el=>{
    const main=el.getBoundingClientRect(),root=el.parentElement!,sidebar=root.querySelector('.design-sidebar')!.getBoundingClientRect(),css=getComputedStyle(root);
    const start=sidebar.right+parseFloat(css.columnGap),end=root.getBoundingClientRect().right-parseFloat(css.paddingRight);
    return {width:main.width,center:main.x+main.width/2,target:(start+end)/2};
   });
   expect(geometry.width).toBeCloseTo(1142,0);expect(geometry.center).toBeCloseTo(geometry.target,0);
  }
 }
});

test('showcase bars and labels fit their cards from phone to ultrawide',async({page})=>{
 await page.goto('/');
 for(const width of [390,1280,1920,3440]) {
  await page.setViewportSize({width,height:1000});
  const monthly=page.locator('.landing .design-monthly');await monthly.scrollIntoViewIfNeeded();
  const bounds=(await monthly.boundingBox())!;
  for(const label of await monthly.locator('.design-monthly-bars small').all()) {
   const box=(await label.boundingBox())!;
   expect(box.y+box.height).toBeLessThan(bounds.y+bounds.height-8);
   expect(box.x).toBeGreaterThanOrEqual(bounds.x);
   expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width);
  }
  const strategy=page.locator('.landing .design-strategy-example');
  expect(await strategy.evaluate(el=>getComputedStyle(el).overflow)).toBe('visible');
  expect(await strategy.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('radial-gradient');
 }
});

for(const route of ['/', '/#/app/overview'])test(`equity cursor moves between adjacent pixels and remains after leaving ${route}`,async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(route);
 if(route.includes('/app/')){await savePerformanceFixture(page);await page.reload();}
 const plot=page.locator('.responsive-equity-plot').first();await plot.scrollIntoViewIfNeeded();
 const box=(await plot.boundingBox())!;
 const marker=plot.locator('[data-chart="equity-marker"]');
 await expect.poll(()=>plot.locator('svg').evaluate(svg=>Math.abs((svg as SVGSVGElement).viewBox.baseVal.width-svg.getBoundingClientRect().width))).toBeLessThan(1);
 const positions:number[]=[];
 for(let step=0;step<6;step++) {
  await page.mouse.move(box.x+box.width*.43+step*3,box.y+80);
  await expect.poll(async()=>Number(await marker.getAttribute('cx'))).toBeCloseTo(box.width*.43+step*3,0);
  positions.push(Number(await marker.getAttribute('cx')));
 }
 for(let i=1;i<positions.length;i++)expect(positions[i]-positions[i-1]).toBeCloseTo(3,0);
 const label=await plot.locator('[data-chart="month"]').textContent();
 await page.mouse.move(0,0);
 await expect(marker).toHaveAttribute('cx',String(positions.at(-1)));
 await expect(plot.locator('[data-chart="month"]')).toHaveText(label!);
});

test.describe('public account header',()=>{
 test.use({signedIn:false});
 test('landing, pending session, sign-in and register share identical header geometry',async({page})=>{
  for(const width of [390,1440,2560]) {
   await page.setViewportSize({width,height:1000});await page.goto('/');
   const header=await page.locator('.landing-header').boundingBox();
   const logo=await page.locator('.landing-logo').boundingBox();
   const button=await page.locator('.landing-header .landing-button').boundingBox();
   let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
   await page.route('**/api/auth',async r=>{await gate;await r.fulfill({json:{user:null,previewGuest:false}});});
   await page.getByRole('link',{name:'Start for free',exact:true}).first().click();
   await expect(page.getByLabel('Checking your account')).toBeVisible();
   expect(await page.locator('.landing-header').boundingBox()).toEqual(header);
   await expect(page.getByText(/Opening your workspace|Loading your workspace/)).toHaveCount(0);
   release();await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
   for(const name of ['Register','Sign in']) {
    expect(await page.locator('.landing-header').boundingBox()).toEqual(header);
    expect(await page.locator('.landing-logo').boundingBox()).toEqual(logo);
    expect(await page.locator('.landing-header .landing-button').boundingBox()).toEqual(button);
    await page.getByRole('button',{name,exact:true}).click();
   }
   await page.getByRole('link',{name:'Back to home',exact:true}).click();
   await expect(page.getByRole('heading',{level:1})).toContainText('An idea');
   await page.unroute('**/api/auth');
  }
 });
});
