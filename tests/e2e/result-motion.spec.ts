import { test, expect } from '@playwright/test';

test('landing example stays still and uses the approved chart on every viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.landing .animated-value')).toHaveCount(0);
  const curves = await page.locator('[data-chart="strategy"], [data-chart="benchmark"]').evaluateAll(paths => paths.map(p => p.getAttribute('d')));
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.landing-chart-image')).toBeVisible();
  expect(await page.locator('[data-chart="strategy"], [data-chart="benchmark"]').evaluateAll(paths => paths.map(p => p.getAttribute('d')))).toEqual(curves);
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
  expect(stops.map(stop=>stop.color)).toEqual(['#ffffff','#ffffff','rgb(242, 132, 47)']);
  expect(stops[1].offset).toBeCloseTo(.6);
});

test('drawdown gradient maps zero to white and ten percent loss to orange', async ({ page }) => {
  await page.goto('/');
  const gradient = await page.evaluate(async () => {
    const { drawdownColors } = await import('/src/theme.ts');
    return drawdownColors([{equity:0},{equity:-3},{equity:-12}]);
  });
  expect(gradient.min).toBe(-10);
  expect(gradient.max).toBe(0);
  expect(gradient.dimension).toBe(1);
  expect(gradient.inRange.color).toEqual(['#f2842f','#ffffff']);
});

test('metric colors keep neutral and good white and fade losses toward orange', async ({ page }) => {
  await page.goto('/');
  const colors = await page.evaluate(async () => {
    const { metricTone, metricColor } = await import('/src/theme.ts');
    return { neutral:metricColor(0), good:metricColor(10), bad:metricColor(-10), win:metricTone('Win rate',50), factor:metricTone('Profit factor',1), trades:metricTone('Trades',5000), loss:metricTone('Return',-10), drawdown:metricTone('Max drawdown',15) };
  });
  expect(colors).toEqual({neutral:'rgb(255, 255, 255)',good:'rgb(255, 255, 255)',bad:'rgb(242, 132, 47)',win:0,factor:0,trades:0,loss:-1,drawdown:-1.5});
});

test('equity fades below balance and entirely losing curves never regain white',async({page})=>{
 await page.goto('/');
 const colors=await page.evaluate(async()=>{const {equityLines,metricColor}=await import('/src/theme.ts');const mixed=equityLines('Mixed',[100,110,90,80].map((equity,time)=>({equity,time})),false,false,100);const loss=equityLines('Loss',[95,85,80].map((equity,time)=>({equity,time})),false,false,100);return {mixed:mixed[0].lineStyle.color,loss:loss[0].lineStyle.color,zero:metricColor(0),positive:metricColor(.1),mild:metricColor(-.1),severe:metricColor(-1)};});
 expect(colors.zero).toBe('rgb(255, 255, 255)');expect(colors.positive).toBe(colors.zero);expect(colors.mild).not.toBe(colors.severe);
 const mixed=colors.mixed as {colorStops:{offset:number;color:string}[]},loss=colors.loss as {colorStops:{offset:number;color:string}[]};
 expect(mixed.colorStops.map(stop=>stop.color)).toEqual(['#ffffff','#ffffff','#f2842f',colors.severe]);expect(mixed.colorStops[1].offset).toBeCloseTo(1/3);
 expect(loss.colorStops).toHaveLength(3);expect(loss.colorStops.every(stop=>stop.color!=='#ffffff')).toBe(true);
});

test('deep equity losses reach orange at the same ten percent threshold as drawdown',async({page})=>{
 await page.goto('/');const gradient=await page.evaluate(async()=>{const {equityLines}=await import('/src/theme.ts');return equityLines('Deep loss',[100,110,90,70].map((equity,time)=>({equity,time})),false,false,100)[0].lineStyle.color;});
 const stops=(gradient as {colorStops:{offset:number;color:string}[]}).colorStops;
 expect(stops).toHaveLength(4);expect(stops[2].offset).toBeCloseTo(.5);expect(stops[2].color).toBe('#f2842f');expect(stops[3].color).toBe('rgb(242, 132, 47)');
});
