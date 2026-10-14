import { test, expect } from "@playwright/test";
import { exampleStrategy } from "../../src/types";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", (r) =>
    r.fulfill({ json: { markets: [{ id: "BTC-USD" }] } }),
  );
});
test("backtest progress advances with loaded candles, estimates remaining time and saves a real result", async ({
  page,
}) => {
  await page.goto("/#/app/strategies");
  await page
    .getByLabel("Import strategy JSON file")
    .setInputFiles({
      name: "s.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exampleStrategy)),
    });
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await page.evaluate(() =>
    localStorage.setItem(
      "testify-tester-options-v1",
      JSON.stringify({
        start: "2025-01-01T00:00",
        end: "2025-10-01T00:00",
        splitPct: 70,
        granularity: 3600,
      }),
    ),
  );
  await page.goto("/#/app/backtests");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let requests = 0;
  await page.route("**/api/candles?**", async (route) => {
    const url = new URL(route.request().url());
    requests++;
    if (requests === 2) await gate;
    const start = Number(url.searchParams.get("start")),
      end = Number(url.searchParams.get("end"));
    await route.fulfill({
      json: {
        bars: Array.from(
          { length: Math.ceil((end - start) / 3600) },
          (_, i) => ({
            time: start + i * 3600,
            open: 100 + i * 0.01,
            high: 102 + i * 0.01,
            low: 99 + i * 0.01,
            close: 101 + i * 0.01,
            volume: 100,
            spread: 0,
          }),
        ),
      },
    });
  });
  await page.getByRole("button", { name: "Run backtest", exact: true }).click();
  const bar = page.getByRole("progressbar", { name: "Backtest processing" });
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => Number(await bar.getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  const value = Number(await bar.getAttribute("aria-valuenow"));
  expect(value).toBeLessThan(70);
  await expect(page.getByText(/remaining · estimate/)).toBeVisible();
  await expect(bar.locator("span")).toHaveCSS("animation-name", "none");
  release();
  await expect(
    page.getByRole("heading", { name: "Backtest results", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Backtest results", exact: true }),
  ).toBeVisible();
});
