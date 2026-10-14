import {test,expect} from './fixtures';
import {exampleStrategy} from '../../src/types';
test.describe('account entry and workspace isolation',()=>{
 test.use({signedIn:false});
 test('landing stays public, registration opens the design, logout and another account isolate strategies',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toHaveCount(0);
  await page.goto('/#/app/strategies');await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();await expect(page.locator('.penpot-workspace')).toHaveCount(0);
  await page.getByRole('button',{name:'Create an account',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('adam@example.test');await page.getByLabel('Password',{exact:true}).fill('browser-test-password-only');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.locator('.penpot-workspace')).toBeVisible();await page.getByLabel('Import strategy JSON file').setInputFiles({name:'account.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exampleStrategy,name:'Adam private strategy'}))});await expect(page.locator('.strategy-card')).toHaveCount(1);await page.reload();await expect(page.locator('.strategy-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true}).click();await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();await page.getByLabel('Email',{exact:true}).fill('bob@example.test');await page.getByLabel('Password',{exact:true}).fill('browser-test-password-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.penpot-workspace')).toBeVisible();await expect(page.locator('.strategy-card')).toHaveCount(0);await expect(page.getByText('Adam private strategy',{exact:true})).toHaveCount(0);
 });
});
test('expired API sessions return to sign-in and hide the old workspace',async({page})=>{
 await page.goto('/#/app/studio');await expect(page.locator('.design-studio-assistant')).toBeVisible();await page.route('**/api/generate-strategy',r=>{expect(r.request().headers()['x-testify-session']).toBe('e2e-session');return r.fulfill({status:401,json:{error:'Session expired'}});});await page.getByLabel('Describe your strategy',{exact:true}).fill('Create a crossover');await page.getByRole('button',{name:'Generate new draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();await expect(page.locator('.penpot-workspace')).toHaveCount(0);
});
