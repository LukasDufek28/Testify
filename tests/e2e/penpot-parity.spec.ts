import {test, expect,reduceTestMotion} from './fixtures';

const widths = [320,390,560,768,960,1024,1280,1440,1920,2560,3440];
test.beforeEach(async ({ page }) => {
  await page.route('**/api/markets', r => r.fulfill({ json: { markets: [{ id: 'BTC-USD' }] } }));
  await reduceTestMotion(page);
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
  await expect(page.locator('.assistant-entry,.design-studio-assistant')).toHaveCount(0);
  const chart=await page.locator('.design-responsive-equity').boundingBox(),latest=await page.locator('.design-latest').boundingBox();
  expect(chart!.x).toBe(266);expect(Math.abs(chart!.y-latest!.y)).toBeLessThanOrEqual(1);expect(Math.abs(chart!.height-latest!.height)).toBeLessThanOrEqual(1);expect(latest!.width).toBe(290);
  const monthly=await page.locator('.design-monthly').boundingBox(),continuation=await page.locator('.design-continue').boundingBox();
  expect(Math.abs(monthly!.y-continuation!.y)).toBeLessThanOrEqual(1);expect(Math.abs(monthly!.height-continuation!.height)).toBeLessThanOrEqual(1);
  const headers=await page.locator('.design-dashboard-bottom .design-card-title').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().y));expect(Math.abs(headers[0]-headers[1])).toBeLessThanOrEqual(1);
  const balance = page.locator('.design-latest .design-final-balance');
  await expect(balance).toHaveCSS('background-color','rgb(34, 33, 40)');
  await expect(balance).toHaveCSS('background-image','linear-gradient(rgba(24, 23, 31, 0), rgba(145, 245, 171, 0.05))');
  for (const metric of await page.locator('.design-metric').all()) await expect(metric).toHaveCSS('background-color','rgb(24, 23, 31)');
  await expect(page.locator('.design-monthly')).toHaveCSS('background-color','rgb(24, 23, 31)');
  await expect(page.locator('.responsive-equity-plot')).toHaveCount(0);
  await expect(page.getByText('Your performance starts here',{exact:true})).toBeVisible();
});
