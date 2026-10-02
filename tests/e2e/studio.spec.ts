import { test, expect } from '@playwright/test';

test('strategy studio fits desktop screens and keeps creation and revision accessible', async ({page}) => {
  await page.route('**/api/markets', route => route.fulfill({json:{markets:[]}}));
  await page.goto('/#/app/studio');
  await expect(page.getByRole('heading',{name:'Strategy creation',exact:true})).toBeVisible();
  for (const [width,height] of [[1366,768],[1280,720],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await expect(page.getByRole('button',{name:'Save',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Generate new draft',exact:true})).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height+1);
    expect(await page.locator('.editor-wrap').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(250);
  }
  await page.getByRole('tab',{name:'Improve',exact:true}).click();
  await expect(page.getByRole('button',{name:/Improve selected strategy/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Improve selected strategy/})).toBeDisabled();
  await page.getByRole('tab',{name:'Create',exact:true}).click();
  await page.getByRole('button',{name:'Validate',exact:true}).click();
  await expect(page.locator('.banner.success')).toContainText('Strategy format is valid');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('.strategy-panel summary').click();
  await expect(page.locator('.strategy-list button')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
