import { test, expect } from "./fixtures";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", (r) =>
    r.fulfill({ json: { markets: [{ id: "BTC-USD" }] } }),
  );
});
test("copied font, icons, card glare and restrained profit gradients load", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/app/overview");
  await expect(page.locator(".penpot-workspace")).toHaveCSS(
    "background-color",
    "rgb(24, 23, 31)",
  );
  await expect(page.locator(".design-assistant")).toHaveCSS(
    "border-radius",
    "24px",
  );
  await expect(page.locator(".design-metric")).toHaveCount(3);
  expect(
    await page
      .locator(".design-metric")
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundImage),
  ).toContain("0.05");
  expect(
    await page
      .locator(".design-metric")
      .last()
      .evaluate((e) => getComputedStyle(e).backgroundImage),
  ).toContain("230, 154, 154");
  expect(
    await page
      .locator(".design-card")
      .first()
      .evaluate((e) => getComputedStyle(e, "::before").maskComposite),
  ).toContain("exclude");
  await expect
    .poll(() =>
      page
        .locator(".design-icon img")
        .evaluateAll((images) =>
          images.every(
            (i) =>
              (i as HTMLImageElement).complete &&
              (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
});
test("all approved workspace pages resize without outer overflow or browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const route of [
    "overview",
    "strategies",
    "backtests",
    "runsettings",
    "trades",
  ]) {
    await page.goto("/#/app/" + route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }
  expect(errors).toEqual([]);
});

test("latest balance retains the Penpot mint gradient over its parent gray and exported outline icons stay transparent", async ({ page }) => {
  await page.goto('/#/app/overview');
  const card = page.locator('.design-latest');
  const background = await card.evaluate(e => getComputedStyle(e).backgroundColor);
  await expect(card.locator('.design-final-balance')).toHaveCSS('background-color', background);
  await expect(card.locator('.design-final-balance')).toHaveCSS('background-image', 'linear-gradient(rgba(24, 23, 31, 0), rgba(145, 245, 171, 0.05))');
  const icons = await page.locator('.design-icon img').evaluateAll(images => [...new Set(images.map(image => (image as HTMLImageElement).src))]);
  for (const url of icons) {
    const response = await page.request.get(url);
    const svg = await response.text();
    expect(svg.match(/<svg[^>]*fill="none"/)).not.toBeNull();
  }
});

test("phone navigation, native chart labels and monthly cards remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/#/app/overview');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.locator('.design-sidebar')).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await expect(page.locator('.design-sidebar')).not.toBeVisible();
  const chart = page.locator('.responsive-equity-plot');
  await chart.scrollIntoViewIfNeeded();
  await chart.focus();
  await page.keyboard.press('End');
  await expect(chart.locator('[data-chart="month"]')).toHaveText('31 Dec 2026');
  expect(await chart.locator('svg text').evaluateAll(texts => texts.every(t => parseFloat(getComputedStyle(t).fontSize) >= 11))).toBe(true);
  expect(await chart.locator('.responsive-equity-tooltip').evaluate(e => e.getBoundingClientRect().right)).toBeLessThanOrEqual(320);
  const monthly = page.locator('.design-monthly');
  const value = await monthly.locator('.design-monthly-heading strong').textContent();
  await monthly.getByRole('button', { name: 'Jan monthly return' }).click();
  await expect(monthly.locator('.design-monthly-heading strong')).not.toHaveText(value!);
  await expect(monthly.getByRole('button', { name: 'Jan monthly return' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
test("settings dialog traps focus and Escape restores the invoking control", async ({
  page,
}) => {
  await page.goto("/#/app/overview");
  const trigger = page.getByRole("button", { name: "Settings", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Workspace settings" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close settings" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("monthly mint gradients and separate trade navigation retain the approved design", async ({
  page,
}) => {
  await page.goto("/#/app/overview");
  const selected = page.getByRole("button", { name: "Apr monthly return" });
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  const g = await selected
    .locator("span")
    .evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(g).toContain("145, 245, 171");
  expect(g).toContain("91, 175, 119");
  await page.goto("/#/app/trades");
  await expect(
    page.getByRole("button", { name: "Previous trade", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next trade", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selected trade · #25", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous trade", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Next bar", exact: true }).click();
  await expect(page.getByText("38 / 44 bars", { exact: true })).toBeVisible();
});
