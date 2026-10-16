import {test,expect,clickWorkspaceButton} from './fixtures';
import {exampleStrategy} from '../../src/types';
test.describe('account entry and workspace isolation',()=>{
 test.use({signedIn:false});
 test('approved account screens stay centered and usable on desktop and phone',async({page})=>{
  await page.goto('/#/app/overview');
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});
   for(const mode of ['login','register']) {
    const title=page.getByRole('heading',{name:mode==='login'?'Welcome back':'Create your account',exact:true});
    await expect(title).toBeVisible();await expect(title).toHaveCSS('text-align','center');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const logo=page.getByRole('link',{name:'Testify home'});await expect(logo).toHaveAttribute('href','#');
    expect((await logo.boundingBox())!.x).toBeLessThanOrEqual(80);
    expect(await page.getByLabel('Email',{exact:true}).evaluate(el=>getComputedStyle(el,'::placeholder').color)).toBe('rgba(158, 157, 167, 0.65)');
    await page.getByRole('button',{name:mode==='login'?'Register':'Sign in',exact:true}).click();
   }
  }
 });
 test('landing stays public, registration opens the design, logout and another account isolate strategies',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toHaveCount(0);
  await page.goto('/#/app/strategies');await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();await expect(page.locator('.penpot-workspace')).toHaveCount(0);
  await page.getByRole('button',{name:'Register',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('adam@example.test');await page.getByLabel('Password',{exact:true}).fill('browser-test-password-only');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.locator('.penpot-workspace')).toBeVisible();await page.getByLabel('Import strategy JSON file').setInputFiles({name:'account.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exampleStrategy,name:'Adam private strategy'}))});await expect(page.locator('.strategy-card')).toHaveCount(1);await page.reload();await expect(page.locator('.strategy-card')).toHaveCount(1);
  await clickWorkspaceButton(page,'Open account menu');await page.getByRole('menuitem',{name:'Sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();await page.getByLabel('Email',{exact:true}).fill('bob@example.test');await page.getByLabel('Password',{exact:true}).fill('browser-test-password-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.penpot-workspace')).toBeVisible();await expect(page.locator('.strategy-card')).toHaveCount(0);await expect(page.getByText('Adam private strategy',{exact:true})).toHaveCount(0);
 });
});
test('expired API sessions return to sign-in and hide the old workspace',async({page})=>{
 await page.goto('/#/app/studio');await expect(page.getByRole('button',{name:'Ask assistant',exact:true})).toBeVisible();await page.route('**/api/assistant',r=>{expect(r.request().headers()['x-testify-session']).toBe('e2e-session');return r.fulfill({status:401,json:{error:'Session expired'}});});await page.getByRole('button',{name:'Ask assistant',exact:true}).click();await page.getByLabel('Message AI assistant').fill('Create a crossover');await page.getByRole('button',{name:'Send assistant message',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();await expect(page.locator('.penpot-workspace')).toHaveCount(0);
});
