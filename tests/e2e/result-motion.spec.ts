import { test, expect } from '@playwright/test';

test('preview numbers count up to exact formatted values including with system reduced motion', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const values = page.locator('.landing-metrics .animated-value');
  await expect(values).toHaveCount(3);
  const final = await values.first().getAttribute('aria-label');
  expect(await values.first().textContent()).not.toBe(final);
  await page.clock.runFor(2200);
  await expect(values.first()).toHaveText(final!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  expect(await values.first().textContent()).not.toBe(final);
  await page.clock.runFor(2200);
  await expect(values.first()).toHaveText(final!);
});

test('equity uses starting balance rather than previous highs and keeps a single series', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { equityData, equityLines } = await import('/src/theme.ts');
    const points = [100,110,105,108,110,115,90].map((equity,time)=>({time,equity}));
    return { data:equityData(points), lines:equityLines("Test",points), capital:equityData([{time:0,equity:95},{time:1,equity:99},{time:2,equity:105}],false,100) };
  });
  expect(result.data.map(point=>point[2])).toEqual([0,1,1,1,1,1,0]);
  expect(result.capital.map(point=>point[2])).toEqual([0,0,1]);
  expect(result.lines).toHaveLength(1);
  expect(result.lines[0].emphasis.disabled).toBe(true);
  const stops = (result.lines[0].lineStyle.color as {colorStops:{offset:number;color:string}[]}).colorStops;
  expect(stops.map(stop=>stop.color)).toEqual(['#ffffff','#ffffff','#f2842f','#f2842f']);
  expect(stops[1].offset).toBeCloseTo(.6);
});

test('drawdown gradient maps zero to white and deepest loss to orange', async ({ page }) => {
  await page.goto('/');
  const gradient = await page.evaluate(async () => {
    const { drawdownColors } = await import('/src/theme.ts');
    return drawdownColors([{equity:0},{equity:-3},{equity:-12}]);
  });
  expect(gradient.min).toBe(-12);
  expect(gradient.max).toBe(0);
  expect(gradient.dimension).toBe(1);
  expect(gradient.inRange.color).toEqual(['#f2842f','#ffffff']);
});

test('metric colors use white and orange endpoints with a neutral midpoint', async ({ page }) => {
  await page.goto('/');
  const colors = await page.evaluate(async () => {
    const { metricTone, metricColor } = await import('/src/theme.ts');
    return { neutral:metricColor(0), good:metricColor(10), bad:metricColor(-10), win:metricTone('Win rate',50), factor:metricTone('Profit factor',1), trades:metricTone('Trades',5000), loss:metricTone('Return',-10), drawdown:metricTone('Max drawdown',15) };
  });
  expect(colors).toEqual({neutral:'rgb(249, 194, 151)',good:'rgb(255, 255, 255)',bad:'rgb(242, 132, 47)',win:0,factor:0,trades:0,loss:-.5,drawdown:0});
});
