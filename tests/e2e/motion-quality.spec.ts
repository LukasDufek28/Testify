import {test,expect,clickWorkspaceButton,reduceTestMotion} from './fixtures';

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
 await expect(page.locator('.design-ai-launcher')).toHaveAttribute('data-motion-active','false');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('motion accordions survive interrupted toggles and reduced motion without clipping controls',async({page})=>{
 await page.goto('/#/app/runsettings');const details=page.locator('.run-defaults').filter({has:page.locator('summary', {hasText:'Saved defaults'})}),summary=details.locator('summary');
 await summary.scrollIntoViewIfNeeded();await summary.click();await expect(details).toHaveAttribute('open','');
 await summary.click();await summary.click();await expect(details).not.toHaveAttribute('data-motion-disclosure',/./);await expect(details).toHaveAttribute('open','');
 await expect(details.getByRole('combobox',{name:'Display timezone',exact:true})).toBeVisible();expect(await details.evaluate(el=>el.style.height)).toBe('');expect(await details.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
 await summary.click();await expect(details).not.toHaveAttribute('open','');
 await reduceTestMotion(page);await summary.click();await expect(details).toHaveAttribute('open','');await expect(details).not.toHaveAttribute('data-motion-disclosure',/./);await summary.click();await expect(details).not.toHaveAttribute('open','');
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

test('motion AI star follows the pointer while its button stays steady and becomes the header emblem',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/#/app/overview');const launcher=page.getByRole('button',{name:'Open AI assistant',exact:true});await expect(launcher).toBeVisible();await expect(launcher.locator('.assistant-emblem')).toHaveCount(1);
 const before=(await launcher.boundingBox())!,fine=await page.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches);
 if(fine){
  await launcher.hover({position:{x:25,y:30}});const emblem=launcher.locator('.assistant-launcher-emblem');await expect.poll(()=>emblem.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeLessThan(-3);
  await launcher.hover({position:{x:before.width-25,y:before.height-25}});await expect.poll(()=>emblem.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeGreaterThan(3);
  await expect(launcher.locator('.assistant-launcher-label')).toHaveCSS('opacity','0.85');const after=(await launcher.boundingBox())!;for(const key of ['x','y','width','height'] as const)expect(after[key]).toBeCloseTo(before[key],1);
 }else{await launcher.dispatchEvent('pointermove',{pointerType:'touch',clientX:before.x+10,clientY:before.y+10});await expect(launcher.locator('.assistant-launcher-emblem')).toHaveCSS('transform','none');}
 await launcher.click();const chat=page.getByRole('dialog',{name:'AI assistant'}),emblem=chat.locator('.assistant-transition-emblem');await expect(page.locator('.assistant-emblem')).toHaveCount(1);
 await expect.poll(async()=>Math.abs((await emblem.boundingBox())!.width-18)).toBeLessThan(.1);
 const star=(await emblem.boundingBox())!,badge=(await chat.locator('.assistant-header-emblem-placeholder').boundingBox())!;expect(star.x+star.width/2).toBeCloseTo(badge.x+badge.width/2,0);expect(star.y+star.height/2).toBeCloseTo(badge.y+badge.height/2,0);
 await expect(chat.locator('.assistant-chat')).toHaveCSS('transform','none');await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);await expect(launcher.locator('.assistant-emblem')).toHaveCount(1);await expect(launcher).toBeFocused();
});

test('motion AI star and dock stay still with reduced motion including pointer interaction',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/#/app/overview');const launcher=page.getByRole('button',{name:'Open AI assistant',exact:true});await launcher.hover({position:{x:30,y:30}});await reduceTestMotion(page);
 await launcher.click();const live=page.getByRole('dialog',{name:'AI assistant'});expect(Math.round((await live.boundingBox())!.height)).toBe(343);await live.getByRole('button',{name:'Close assistant'}).click();await expect(launcher).toBeVisible();
 for(const reload of [false,true]){if(reload)await page.reload();await launcher.hover({position:{x:30,y:30}});await expect(launcher.locator('.assistant-launcher-emblem-core')).toHaveCSS('transform','none');await expect(launcher.locator('.assistant-launcher-emblem')).toHaveCSS('transform','none');await expect(launcher.locator('.assistant-launcher-face')).toHaveCSS('transform','none');await expect(launcher.locator('.assistant-emblem-glint')).toHaveCSS('opacity','0');}
 let release=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/assistant',async route=>{await waiting;await route.fulfill({json:{answer:'Hello.',actions:[]}}).catch(()=>{});});
 await launcher.click();const chat=page.getByRole('dialog',{name:'AI assistant'});await expect.poll(async()=>Math.round((await chat.boundingBox())!.height)).toBe(343);await expect(chat.locator('.assistant-transition-emblem')).toHaveCSS('transform','none');await expect(chat.locator('.assistant-chat')).toHaveCSS('opacity','1');
 await chat.getByLabel('Message AI assistant').fill('Hello');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat.locator('.assistant-activity-text')).toHaveCSS('animation-name','none');await chat.getByRole('button',{name:'Stop assistant'}).click();release();await expect(chat).toContainText('Response stopped.');await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);
});

test('motion chat preserves old message nodes and gives legacy and new messages stable identities',async({page})=>{
 await page.goto('/#/app/overview');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('testify-assistant-v1:e2e-user'))).toBe('[]');await page.evaluate(()=>localStorage.setItem('testify-assistant-v1:e2e-user',JSON.stringify([{role:'user',text:'Earlier question'},{role:'assistant',text:'Earlier answer'}])));await page.reload();await page.route('**/api/assistant',route=>route.fulfill({json:{answer:'A fresh answer.',actions:[]}}));
 await clickWorkspaceButton(page,'Open AI assistant');const chat=page.getByRole('dialog',{name:'AI assistant'});await expect(chat.getByText('Earlier answer',{exact:true})).toBeVisible();await page.evaluate(()=>{(window as any).earlierMessage=document.querySelector('.assistant-message');});
 await chat.getByLabel('Message AI assistant').fill('Next question');await chat.getByRole('button',{name:'Send assistant message'}).click();await expect(chat.getByText('A fresh answer.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).earlierMessage===document.querySelector('.assistant-message'))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>{const messages=JSON.parse(localStorage.getItem('testify-assistant-v1:e2e-user')!);return messages.length===4&&messages.every((message:any)=>typeof message.id==='string')&&new Set(messages.map((message:any)=>message.id)).size===4;})).toBe(true);
});

test.describe('motion device preference',()=>{
 test.use({reducedMotion:'reduce'});
 test('motion plays by default despite device reduced motion and remembers an explicit opt-out',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/#/app/overview');
  const html=page.locator('html'),launcher=page.getByRole('button',{name:'Open AI assistant',exact:true});
  await expect(html).toHaveAttribute('data-motion','full');await expect(html).toHaveAttribute('data-motion-preference','full');
  await expect(page.getByRole('button',{name:'Enable animations',exact:true})).toHaveCount(0);
  await expect(launcher).toHaveAttribute('data-motion-active','true');await expect.poll(()=>launcher.locator('.assistant-emblem-glint').evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(.1);
  // Observe actual frames: the reported failure was an instant jump, even
  // though a deployment and the final dialog both appeared correct.
  await page.evaluate(()=>document.addEventListener('click',()=>{
   const frames:number[]=[];(window as any).openingWidths=frames;
   const sample=()=>{const dialog=document.querySelector('[role=dialog][aria-label="AI assistant"]');if(dialog)frames.push(dialog.getBoundingClientRect().width);if(frames.length<16)requestAnimationFrame(sample);};requestAnimationFrame(sample);
  },{once:true}));
  await launcher.click();const chat=page.getByRole('dialog',{name:'AI assistant'});
  await expect.poll(()=>page.evaluate(()=>(window as any).openingWidths?.length??0)).toBeGreaterThanOrEqual(16);
  const frames=await page.evaluate(()=>(window as any).openingWidths as number[]);expect(Math.max(...frames)-Math.min(...frames)).toBeGreaterThan(6);
  await expect(chat.locator('.assistant-chat')).toHaveCSS('transform','none');await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);
  await page.reload();await expect(html).toHaveAttribute('data-motion','full');await expect(html).toHaveAttribute('data-motion-preference','full');await expect(page.getByRole('button',{name:'Enable animations',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Open account menu',exact:true}).click();const animations=page.getByRole('menuitemcheckbox',{name:/Animations/});await expect(animations).toBeChecked();
  await animations.press('Space');await expect(animations).not.toBeChecked();await expect(html).toHaveAttribute('data-motion','reduced');
  await page.keyboard.press('Escape');await page.reload();await expect(html).toHaveAttribute('data-motion','reduced');await page.getByRole('button',{name:'Open account menu',exact:true}).click();await expect(animations).not.toBeChecked();
  await page.getByRole('menuitem',{name:'Use device setting',exact:true}).click();await expect(html).toHaveAttribute('data-motion-preference','system');await expect(animations).toBeFocused();
  await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});await expect(html).toHaveAttribute('data-motion','full');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });

 test('motion preference syncs between tabs without resetting an open conversation draft',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/app/overview');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(page.getByRole('button',{name:'Enable animations',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Open AI assistant',exact:true}).click();const chat=page.getByRole('dialog',{name:'AI assistant'});const input=chat.getByLabel('Message AI assistant');await expect(input).toBeFocused();await input.fill('Keep this unsent idea');
  const other=await context.newPage();
  try{
   await other.goto('/');await expect(other.locator('html')).toHaveAttribute('data-motion','full');
   await other.evaluate(()=>localStorage.setItem('testify-motion-v1','reduced'));await expect(page.locator('html')).toHaveAttribute('data-motion','reduced');await expect(input).toHaveValue('Keep this unsent idea');await expect(chat).toBeVisible();
   await other.evaluate(()=>localStorage.setItem('testify-motion-v1','system'));await expect(page.locator('html')).toHaveAttribute('data-motion-preference','system');await expect(page.locator('html')).toHaveAttribute('data-motion','reduced');
   await other.evaluate(()=>localStorage.removeItem('testify-motion-v1'));await expect(page.locator('html')).toHaveAttribute('data-motion-preference','full');await expect(page.locator('html')).toHaveAttribute('data-motion','full');
   await chat.getByRole('button',{name:'Close assistant'}).click();await expect(chat).toHaveCount(0);await expect(page.getByRole('button',{name:'Open navigation',exact:true})).toBeFocused();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await other.close();}
 });
});

test.describe('motion account transitions',()=>{
 test.use({signedIn:false});
 test('motion auth switch preserves email and header geometry and focuses the new form',async({page})=>{
  await page.goto('/#/app/overview');const email=page.getByLabel('Email',{exact:true}),password=page.getByLabel('Password',{exact:true});await email.fill('motion@example.test');await password.fill('temporary-password');
  await page.evaluate(()=>document.fonts.ready);const logo=page.getByRole('link',{name:'Testify home',exact:true});const geometry=()=>logo.evaluate(el=>{const rect=el.getBoundingClientRect();return {x:rect.x+scrollX,y:rect.y+scrollY,width:rect.width,height:rect.height};});const before=await geometry();
  await page.getByRole('button',{name:'Register',exact:true}).click();await expect(page.getByRole('heading',{name:'Create your account',exact:true})).toBeVisible();await expect(email).toHaveValue('motion@example.test');await expect(password).toHaveValue('');await expect(email).toBeFocused();
  const after=await geometry();for(const key of ['x','y','width','height'] as const)expect(after[key]).toBeCloseTo(before[key],1);
  await reduceTestMotion(page);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(email).toBeFocused();await expect(page.locator('.auth-card')).toHaveCSS('transform','none');
 });
});
