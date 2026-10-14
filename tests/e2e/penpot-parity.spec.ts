import { test, expect } from './fixtures';

const widths = [320,390,560,768,960,1024,1280,1440,1920,2560,3440];
test.beforeEach(async ({ page }) => {
  await page.route('**/api/markets', r => r.fulfill({ json: { markets: [{ id: 'BTC-USD' }] } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const route of ['overview','strategies','backtests','runsettings','trades']) {
  test(`${route} fills the viewport and retains Penpot surfaces across phone through ultrawide`, async ({ page }, testInfo) => {
    await page.goto('/#/app/' + route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.locator('.penpot-workspace').evaluate(e => Math.abs(e.getBoundingClientRect().width - document.documentElement.clientWidth))).toBeLessThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.locator('.penpot-workspace')).toHaveCSS('background-color','rgb(24, 23, 31)');
      const raised = page.locator('.design-card.raised');
      for (const card of await raised.all()) await expect(card).toHaveCSS('background-color','rgb(34, 33, 40)');
      if ([390,1440,3440].includes(width)) {
        await page.evaluate(() => document.fonts.ready);
        if (await page.locator('.responsive-equity-plot').count()) {
          await expect.poll(() => page.locator('.responsive-equity-plot svg').evaluate(svg => Math.abs((svg as SVGSVGElement).viewBox.baseVal.width - svg.getBoundingClientRect().width))).toBeLessThan(1);
          expect(await page.locator('.responsive-equity-plot svg').evaluate(svg => {
            const view = (svg as SVGSVGElement).viewBox.baseVal;
            return [...svg.querySelectorAll('text')].every(text => {
              const box = text.getBBox();
              return box.y >= view.y && box.y + box.height <= view.y + view.height;
            });
          })).toBe(true);
        }
        const name = `${route}-${width}.png`;
        await page.screenshot({ path: process.env.TESTIFY_AUDIT_DIR ? `${process.env.TESTIFY_AUDIT_DIR}/${name}` : testInfo.outputPath(name), fullPage: true });
      }
    }
  });
}

test('dashboard geometry and gradients match the live 1440px Penpot reference', async ({ page }) => {
  await page.setViewportSize({ width:1440,height:900 });
  await page.goto('/#/app/overview');
  const reference = [
    ['.design-assistant',266,178,290,343],
    ['.design-latest',266,537,290,318],
    ['.design-responsive-equity',572,321,836,336],
    ['.design-monthly',572,675,390,210],
    ['.design-continue',978,675,430,180],
  ] as const;
  for (const [selector,x,y,width,height] of reference) {
    await expect.poll(async () => {
      const b = await page.locator(selector).boundingBox();
      return Math.max(Math.abs(b!.x-x),Math.abs(b!.y-y),Math.abs(b!.width-width),Math.abs(b!.height-height));
    }, {message:`${selector} must match Penpot bounds`}).toBeLessThanOrEqual(1);
  }
  const balance = page.locator('.design-latest .design-final-balance');
  await expect(balance).toHaveCSS('background-color','rgb(34, 33, 40)');
  await expect(balance).toHaveCSS('background-image','linear-gradient(rgba(24, 23, 31, 0), rgba(145, 245, 171, 0.05))');
  for (const metric of await page.locator('.design-metric').all()) await expect(metric).toHaveCSS('background-color','rgb(24, 23, 31)');
  await expect(page.locator('.design-monthly')).toHaveCSS('background-color','rgb(24, 23, 31)');
  await expect(page.locator('.responsive-equity-plot svg text').filter({ hasText: /^10%$/ })).toHaveCount(1);
});
