import { test, expect } from '@playwright/test';

test('preview numbers count up to exact formatted values and respect reduced motion', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const values = page.locator('.landing-metrics .animated-value');
  await expect(values).toHaveCount(3);
  const final = await values.first().getAttribute('aria-label');
  expect(await values.first().textContent()).not.toBe(final);
  await page.clock.runFor(1500);
  await expect(values.first()).toHaveText(final!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(values.first()).toHaveText(final!);
});

test('equity uses orange at profitable highs and foundation blue during drawdown', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { equityData, equityLines } = await import('/src/theme.ts');
    return { data: equityData([100,110,105,108,110,115,90].map((equity,time)=>({time,equity}))), lines: equityLines("Test", [100,110,105,108,110,115,90].map((equity,time)=>({time,equity}))) };
  });
  expect(result.data.map(point=>point[2])).toEqual([0,1,0,0,1,1,0]);
  expect(result.lines[0].lineStyle.color).toBe('#455b8a');
  expect(result.lines[1].lineStyle.color).toBe('#f2842f');
  expect(result.lines[1].data.at(-1)![1]).toBeNull();
});

test('drawdown gradient maps zero to orange and deepest loss to foundation blue', async ({ page }) => {
  await page.goto('/');
  const gradient = await page.evaluate(async () => {
    const { drawdownColors } = await import('/src/theme.ts');
    return drawdownColors([{equity:0},{equity:-3},{equity:-12}]);
  });
  expect(gradient.min).toBe(-12);
  expect(gradient.max).toBe(0);
  expect(gradient.dimension).toBe(1);
  expect(gradient.inRange.color).toEqual(['#455b8a','#f2842f']);
});

test('metric colors use white neutrality with bounded orange and foundation blue', async ({ page }) => {
  await page.goto('/');
  const colors = await page.evaluate(async () => {
    const { metricTone, metricColor } = await import('/src/theme.ts');
    return { neutral:metricColor(0), good:metricColor(10), bad:metricColor(-10), win:metricTone('Win rate',50), factor:metricTone('Profit factor',1), trades:metricTone('Trades',5000), loss:metricTone('Return',-10), drawdown:metricTone('Max drawdown',15) };
  });
  expect(colors).toEqual({neutral:'rgb(255, 255, 255)',good:'rgb(242, 132, 47)',bad:'rgb(69, 91, 138)',win:0,factor:0,trades:0,loss:-.5,drawdown:-.5});
});
