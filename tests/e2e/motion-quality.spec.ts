import {test,expect} from './fixtures';

test('motion navigation keeps one highlight aligned after rapid section changes',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/#/app/overview');
 const nav=page.getByRole('navigation',{name:'Workspace navigation'});
 for(const name of ['Strategies','Backtests','Dashboard','Strategies'])await nav.getByRole('button',{name,exact:true}).click();
 const active=nav.getByRole('button',{name:'Strategies',exact:true}),highlight=nav.locator('.design-nav-highlight');
 await expect(active).toHaveAttribute('aria-current','page');await expect(highlight).toHaveCount(1);
 await expect.poll(async()=>{const a=(await active.boundingBox())!,b=(await highlight.boundingBox())!;return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width),Math.abs(a.height-b.height));}).toBeLessThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('motion mobile drawer restores focus and opens the assistant without leaving a blocking menu',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#/app/data');
 const trigger=page.getByRole('button',{name:'Open navigation',exact:true}),sidebar=page.locator('.design-sidebar');
 await trigger.click();await expect(page.getByRole('button',{name:'Close navigation',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await expect(sidebar).toHaveAttribute('inert','');
 await trigger.click();await page.getByRole('button',{name:'Close navigation backdrop',exact:true}).click({position:{x:380,y:400}});await expect(trigger).toBeFocused();
 await trigger.click();await page.getByRole('button',{name:'Open AI assistant',exact:true}).click();
 const chat=page.getByRole('dialog',{name:'AI assistant'});await expect(chat.getByLabel('Message AI assistant')).toBeFocused();
 await expect(sidebar).toHaveAttribute('inert','');await expect(page.locator('.design-nav-backdrop')).toHaveCount(0);await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
 await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);await expect(trigger).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('motion accordions survive interrupted toggles and reduced motion without clipping controls',async({page})=>{
 await page.goto('/#/app/runsettings');const details=page.locator('.run-defaults').filter({has:page.locator('summary', {hasText:'Saved defaults'})}),summary=details.locator('summary');
 await summary.scrollIntoViewIfNeeded();await summary.click();await expect(details).toHaveAttribute('open','');
 await summary.click();await summary.click();await expect(details).not.toHaveAttribute('data-motion-disclosure',/./);await expect(details).toHaveAttribute('open','');
 await expect(details.getByRole('combobox',{name:'Display timezone',exact:true})).toBeVisible();expect(await details.evaluate(el=>el.style.height)).toBe('');expect(await details.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
 await summary.click();await expect(details).not.toHaveAttribute('open','');
 await page.emulateMedia({reducedMotion:'reduce'});await summary.click();await expect(details).toHaveAttribute('open','');await expect(details).not.toHaveAttribute('data-motion-disclosure',/./);await summary.click();await expect(details).not.toHaveAttribute('open','');
});

test('motion strategy menus remain overlays without clipping their actions',async({page})=>{
 const {exampleStrategy}=await import('../../src/types');await page.goto('/#/app/strategies');await page.getByLabel('Import strategy JSON file').setInputFiles({name:'motion-rules.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});
 const more=page.getByLabel('More actions for '+exampleStrategy.name),details=more.locator('..');await more.click();await expect(details).toHaveAttribute('open','');await expect(details).not.toHaveAttribute('data-motion-disclosure',/./);
 await details.getByRole('button',{name:'Duplicate',exact:true}).click();await expect(page.locator('.strategy-card')).toHaveCount(2);
});

test('motion popup opens above a low trigger and keeps keyboard selection usable',async({page})=>{
 await page.setViewportSize({width:390,height:650});await page.goto('/#/app/runsettings');
 const details=page.locator('.run-defaults').filter({has:page.locator('summary', {hasText:'Saved defaults'})});await details.locator('summary').click();
 const trigger=details.getByRole('combobox',{name:'Display timezone',exact:true});await trigger.scrollIntoViewIfNeeded();
 await trigger.evaluate(el=>{const r=el.getBoundingClientRect();scrollBy(0,r.bottom-innerHeight+28);});await trigger.click();
 const popup=page.locator('.control-popup');await expect(popup).toHaveAttribute('data-placement','top');await expect(popup).toHaveCSS('opacity','1');
 const box=(await popup.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(11);expect(box.y+box.height).toBeLessThanOrEqual(650);
 await trigger.press('Home');await trigger.press('Enter');await expect(trigger).toContainText('UTC');await expect(trigger).toBeFocused();await expect(popup).toHaveCount(0);
});

test('motion landing reflections pause offscreen and revealed cards do not replay on return',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');const card=page.locator('.landing .design-monthly');
 await expect(card).toHaveAttribute('data-motion-in-view','false');await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').animationPlayState)).toBe('paused');
 await card.scrollIntoViewIfNeeded();await expect(card).toHaveAttribute('data-motion-in-view','true');await expect(card).toHaveCSS('opacity','1');
 await page.evaluate(()=>scrollTo(0,0));await expect(card).toHaveAttribute('data-motion-in-view','false');await card.scrollIntoViewIfNeeded();await expect(card).toHaveCSS('opacity','1');expect(await card.evaluate(el=>el.getAnimations().filter(a=>a.playState==='running'&&a.effect instanceof KeyframeEffect&&a.effect.getKeyframes().some(frame=>'translate' in frame)).length)).toBe(0);
});

test.describe('motion account transitions',()=>{
 test.use({signedIn:false});
 test('motion auth switch preserves email and header geometry and focuses the new form',async({page})=>{
  await page.goto('/#/app/overview');const email=page.getByLabel('Email',{exact:true}),password=page.getByLabel('Password',{exact:true});await email.fill('motion@example.test');await password.fill('temporary-password');
  const logo=page.getByRole('link',{name:'Testify home',exact:true}),before=(await logo.boundingBox())!;
  await page.getByRole('button',{name:'Register',exact:true}).click();await expect(page.getByRole('heading',{name:'Create your account',exact:true})).toBeVisible();await expect(email).toHaveValue('motion@example.test');await expect(password).toHaveValue('');await expect(email).toBeFocused();
  const after=(await logo.boundingBox())!;expect(after).toEqual(before);
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(email).toBeFocused();await expect(page.locator('.auth-card')).toHaveCSS('transform','none');
 });
});
