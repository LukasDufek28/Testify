import { test, expect } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", route => route.fulfill({ json: { markets: [{ id: "BTC-USD", base: "BTC", quote: "USD" }], source: "Coinbase Exchange" } }));
});

test("approved silver landing, local font, and shared chart load without browser errors", async ({ page }) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("An idea is a start.Evidence is an edge.");
  await expect(page.getByRole("heading", { name: /Your strategy\.\s*A clearer picture\./ })).toBeAttached();
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page.locator(".landing-chart-image")).toBeVisible();
  await expect(page.locator(".responsive-equity-header")).toContainText("Equity & drawdown");
  await expect(page.getByText("FROM IDEA TO EVIDENCE", {exact:true})).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 106px Urbanist'))).toBe(true);
  for (const element of [".landing-logo", "#landing-heading", "#preview-heading"]) {
    expect(await page.locator(element).evaluate(e => getComputedStyle(e).backgroundImage)).toContain("linear-gradient");
  }
  expect(await page.locator(".landing").evaluate(e => getComputedStyle(e).backgroundColor)).toBe("rgb(24, 23, 31)");
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("responsive layouts reflow with readable chart labels without horizontal overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const width of [320, 390, 560, 640, 800, 960, 1280, 1440, 1920, 3440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect.poll(async () => page.locator(".landing-chart-image").evaluate(svg => Math.abs((svg as SVGSVGElement).viewBox.baseVal.width - svg.getBoundingClientRect().width))).toBeLessThan(1);
    const current=await page.locator(".landing-chart-image").boundingBox();
    expect(current!.height).toBeGreaterThanOrEqual(224);
    expect(await page.locator(".landing-chart-image text").evaluateAll(texts => texts.every(t => parseFloat(getComputedStyle(t).fontSize) >= 11))).toBe(true);
    const title = await page.locator("#landing-heading").boundingBox();
    expect(title!.x).toBeGreaterThanOrEqual(0);
    expect(title!.x + title!.width).toBeLessThanOrEqual(width);
    const steps = await page.locator(".landing-steps article").evaluateAll(items => items.map(item => item.getBoundingClientRect().y));
    if (width <= 560) expect(steps[1]).toBeGreaterThan(steps[0]);
    else expect(steps[1]).toBeCloseTo(steps[0], 0);
  }
});

test("explore, section links, workspace entry, and return home work", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/#product-preview$/);
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "Less friction. More clarity." })).toBeInViewport();
  await page.getByRole("link", { name: "Product", exact: true }).click();
  await expect(page).toHaveURL(/#product-preview$/);
  await page.getByRole("link", { name: "Open free workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hello, Adam!", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to Testify home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("An idea is a start.");
  await page.getByRole("link", { name: "Start for free", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Hello, Adam!", exact: true })).toBeVisible();
});

test("subtle motion reveals content once and hover does not move the glossy button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("#landing-heading")).toHaveCSS("animation-name", "landing-enter");
  const preview = page.locator(".landing-preview");
  await expect(preview).not.toHaveClass(/is-visible/);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(preview).toHaveClass(/is-visible/);
  await expect(preview).toHaveCSS("opacity", "1");
  await page.getByRole("link", { name: "Testify home" }).first().click();
  await expect(preview).toHaveClass(/is-visible/);
  const cta = page.getByRole("link", { name: "Start for free", exact: true }).first();
  const before = await cta.boundingBox();
  await cta.hover();
  await expect(cta).toHaveCSS("filter", "brightness(1.12)");
  expect((await cta.boundingBox())!.width).toBeCloseTo(before!.width, 1);
  await expect(cta).toHaveCSS("transform", "none");
  expect(await cta.evaluate(e => getComputedStyle(e).backgroundImage)).toContain("linear-gradient");
});

test("reduced motion keeps all content visible and removes entrance animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#landing-heading")).toHaveCSS("animation-name", "none");
  for (const section of [".landing-preview", ".landing-process", ".landing-final"]) {
    await expect(page.locator(section)).toHaveCSS("opacity", "1");
    await expect(page.locator(section)).toHaveCSS("transform", "none");
  }
});


test("approved equity demo responds to hover, touch and keyboard without changing curves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const demo = page.locator(".landing-chart-demo");
  await demo.scrollIntoViewIfNeeded();
  const curves = await demo.locator('[data-chart="strategy"], [data-chart="benchmark"]').evaluateAll(paths => paths.map(p => p.getAttribute("d")));
  await expect(demo.locator('[data-chart="month"]')).toHaveText("May 2026");
  await demo.hover({position:{x:(await demo.boundingBox())!.width * .82,y:100}});
  await expect(demo.locator('[data-chart="month"]')).not.toHaveText("May 2026");
  await expect(demo.locator('[data-chart="strategy-value"]')).not.toHaveText("$19,040");
  expect(await demo.locator('[data-chart="strategy"], [data-chart="benchmark"]').evaluateAll(paths => paths.map(p => p.getAttribute("d")))).toEqual(curves);
  await page.mouse.move(0,0);
  await expect(demo.locator('[data-chart="month"]')).toHaveText("May 2026");
  await demo.focus();
  await page.keyboard.press("End");
  await expect(demo.locator('[data-chart="month"]')).toHaveText("Dec 2026");
  await page.keyboard.press("Home");
  await expect(demo.locator('[data-chart="month"]')).toHaveText("Jan 2026");
  await page.setViewportSize({width:390,height:844});
  await demo.scrollIntoViewIfNeeded();
  await demo.dispatchEvent("pointerdown", {pointerType:"touch",clientX:(await demo.boundingBox())!.x + 200,clientY:(await demo.boundingBox())!.y + 70});
  await expect(demo.locator('[data-chart="month"]')).not.toHaveText("Jan 2026");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(demo.locator("svg")).toBeVisible();
    await demo.scrollIntoViewIfNeeded();
    const box = (await demo.boundingBox())!;
    await page.mouse.move(box.x + box.width * .8, box.y + 80);
    await page.mouse.wheel(0, 450);
    await page.mouse.wheel(0, -450);
    await demo.focus();
    await page.keyboard.press("End");
    await expect(demo.locator('[data-chart="month"]')).toHaveText("Dec 2026");
    await expect(demo.locator('[data-chart="strategy-value"]')).toHaveText(/^\$[\d,]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
  }
  // Tooltip values are independent of the axis text in the DOM.
  await demo.locator("svg text").evaluateAll(texts => texts.forEach(t => t.remove()));
  await page.keyboard.press("Home");
  await expect(demo.locator('[data-chart="month"]')).toHaveText("Jan 2026");
  await expect(demo.locator('[data-chart="strategy-value"]')).toHaveText(/^\$[\d,]+$/);
  expect(errors).toEqual([]);
});
