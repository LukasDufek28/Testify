import { test, expect } from "@playwright/test";

// External services are deterministic here; handler/engine behavior has separate unit tests.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", (route) =>
    route.fulfill({
      json: {
        markets: [{ id: "BTC-USD", base: "BTC", quote: "USD" }],
        source: "Coinbase Exchange",
      },
    }),
  );
});

test("approved copy and original local assets load without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Create and backtesttrading strategiesfor free.",
  );
  await expect(page.locator(".landing-copy p")).toContainText(
    "clear trading rules with AI.",
  );
  await expect(page.locator(".landing-preview-caption")).toHaveText(
    "Product preview",
  );
  await expect(
    page.getByRole("heading", { name: "02 Build with free AI" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Testify", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page
      .locator(".landing-logo")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  for (const asset of [
    "/design/equity.svg",
    "/design/step.svg",
  ])
    expect((await page.request.get(asset)).ok()).toBe(true);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
  const panel = await page.locator(".landing-preview").evaluate((e) => ({
    color: getComputedStyle(e).backgroundColor,
    image: getComputedStyle(e).backgroundImage,
  }));
  expect(panel).toEqual({ color: "rgb(48, 73, 125)", image: "none" });
  expect(await page.getByRole("button", { name: "Sign in", exact: true })
    .evaluate((e) => getComputedStyle(e).color)).toBe("rgb(255, 255, 255)");
});

test("resizing changes layout continuously and the background covers tall windows", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const widths: number[] = [];
  for (const width of [960, 1100, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      preview: document
        .querySelector(".landing-preview")!
        .getBoundingClientRect().width,
      hero: document.querySelector(".landing-hero")!.getBoundingClientRect(),
      chart: document.querySelector(".landing-chart")!.getBoundingClientRect(),
      background: getComputedStyle(document.querySelector(".landing")!)
        .backgroundColor,
    }));
    expect(geometry.overflow).toBe(false);
    expect(geometry.chart.width).toBeGreaterThan(250);
    expect(geometry.background).toBe("rgb(37, 60, 109)");
    widths.push(geometry.preview);
    await expect(
      page.getByRole("link", { name: "Start for free", exact: true }).first(),
    ).toBeVisible();
  }
  for (let i = 1; i < widths.length; i++)
    expect(widths[i]).toBeGreaterThan(widths[i - 1]);
  await page.setViewportSize({ width: 1440, height: 1200 });
  const tall = await page.locator(".landing").boundingBox();
  expect(tall!.height).toBeGreaterThanOrEqual(1200);
  await page.setViewportSize({ width: 640, height: 900 });
  const copy = await page.locator(".landing-copy").boundingBox();
  const preview = await page.locator(".landing-preview").boundingBox();
  expect(preview!.y).toBeGreaterThan(copy!.y + copy!.height);
  for (const width of [320, 390, 720]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});

test("landing links, dialog keyboard handling, and actual workspace navigation work", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await page
    .getByRole("link", { name: "Product preview", exact: true })
    .click();
  await expect(page).toHaveURL(/#product-preview$/);
  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  await signIn.click();
  await expect(
    page.getByRole("dialog", { name: "Start your research" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(signIn).toBeFocused();
  await page
    .getByRole("link", { name: "Explore the product", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your first strategy starts here", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Testify home" }).click();
  await page
    .getByRole("link", { name: "Start for free", exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Your first strategy starts here", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create with AI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Strategy creation", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Testify home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Create and backtest",
  );
});

test("hover grows the CTA slightly and runs a white glare sweep even with system motion reduction", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const cta = page
    .getByRole("link", { name: "Start for free", exact: true })
    .first();
  const before = await cta.boundingBox();
  await cta.hover();
  await expect
    .poll(async () => {
      const box = await cta.boundingBox();
      return box!.width / before!.width;
    })
    .toBeGreaterThan(1.02);
  const ratio = (await cta.boundingBox())!.width / before!.width;
  expect(ratio).toBeLessThan(1.04);
  expect(
    await cta.evaluate((e) => getComputedStyle(e, "::after").backgroundImage),
  ).toContain("255, 255, 255");
  expect(
    await cta.evaluate((e) => getComputedStyle(e, "::after").animationName),
  ).toBe("landing-glare");
});

test("preview content enters in sequence and equity draws with deceleration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const animation = await page.evaluate(() => {
    const delays = [...document.querySelectorAll(".landing-metrics>div")].map(
      (e) => parseFloat(getComputedStyle(e).animationDelay),
    );
    const reveal = document.querySelector(".landing-curve-reveal")!;
    const draw = reveal.getAnimations()[0];
    if (!draw) throw Error("Equity animation missing");
    draw.pause();
    draw.currentTime = 1000;
    const initial = getComputedStyle(reveal).transform;
    draw.currentTime = 1900;
    const midway = getComputedStyle(reveal).transform;
    draw.finish();
    return {
      delays,
      initial,
      midway,
      final: getComputedStyle(reveal).transform,
      easing: getComputedStyle(reveal).animationTimingFunction,
    };
  });
  expect(animation.delays[1]).toBeGreaterThan(animation.delays[0]);
  expect(animation.delays[2]).toBeGreaterThan(animation.delays[1]);
  expect(animation.initial).toContain("matrix(0,");
  const midpoint = Number(animation.midway.match(/matrix\(([^,]+)/)?.[1]);
  expect(midpoint).toBeGreaterThan(0.75);
  expect(midpoint).toBeLessThan(1);
  expect(animation.final).toContain("matrix(1,");
  expect(animation.easing).toBe("cubic-bezier(0.12, 0.8, 0.2, 1)");
});

test("equity actually progresses over time with the user's system motion setting", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const curve = page.locator(".landing-curve-reveal");
  const progress = () => curve.evaluate((e) => {
    const transform = getComputedStyle(e).transform;
    return transform === "none" ? 1 : Number(transform.match(/matrix\(([^,]+)/)?.[1]);
  });
  expect(await progress()).toBeLessThan(1);
  await expect.poll(progress).toBeGreaterThan(0.1);
  await expect.poll(progress).toBe(1);
});
