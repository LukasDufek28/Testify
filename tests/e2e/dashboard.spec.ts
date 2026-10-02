import { test, expect } from "@playwright/test";
import { exampleStrategy } from "../../src/types";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", route => route.fulfill({ json: { markets: [{ id: "BTC-USD" }] } }));
});

test("new user dashboard matches the design, stays empty, and resizes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/#/app/overview");
  await expect(page.getByRole("heading", { name: "Your first strategy starts here", exact: true })).toBeVisible();
  await expect(page.getByText("You do not have any saved strategies yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  for (const width of [320, 390, 640, 850, 960, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.setViewportSize({ width: 1440, height: 1200 });
  expect((await page.locator(".dashboard-shell").boundingBox())!.height).toBeGreaterThanOrEqual(1200);
  await page.reload();
  await expect(page.getByText("You do not have any saved strategies yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Workspace settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("onboarding steps open existing strategy, data, and backtest flows", async ({ page }) => {
  for (const [step, heading] of [["1 Create a strategy", "Strategy creation"], ["2 Choose your data", "Crypto markets"], ["3 Run and review", "Backtests"]]) {
    await page.goto("/#/app/overview");
    await page.reload();
    await page.getByRole("button", { name: `Open this step: ${step}`, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
});

test("JSON import validates files and persists the user's strategy", async ({ page }) => {
  await page.goto("/#/app/overview");
  await page.locator('input[type="file"]').setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{}') });
  await expect(page.getByRole("alert")).toBeVisible();
  const strategy = { ...exampleStrategy, name: "My imported strategy" };
  await page.locator('input[type="file"]').setInputFiles({ name: "strategy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(strategy)) });
  await expect(page.getByRole("heading", { name: "Strategy creation", exact: true })).toBeVisible();
  await expect(page.locator(".strategy-list")).toContainText(strategy.name);
  await page.reload();
  await expect(page.getByText("You have 1 saved strategy, ready for a first backtest.", { exact: false })).toBeVisible();
});

test("completed backtests select the returning-user dashboard after storage loads", async ({ page }) => {
  await page.goto("/#/app/overview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("testify-local-v1", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("runs", "readwrite");
        tx.objectStore("runs").put({ id: "completed-test", name: "Completed backtest", createdAt: Date.now(), symbol: "BTC-USD", strategyId: "s", strategyName: "Test strategy", metrics: { netReturnPct: 12, maxDrawdownPct: 3, tradeCount: 2, sharpe: 1, winRatePct: 50, totalFees: 0 }, curve: [], trades: [], warnings: [] });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Build. Test. Learn.", exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-welcome")).toHaveCount(0);
});

test("landing card tilt stays subtle and resets when the cursor leaves", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".landing-preview-tilt");
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * .95, box.y + box.height * .1);
  const tilt = await card.evaluate(e => ({ x: parseFloat((e as HTMLElement).style.getPropertyValue("--tilt-x")), y: parseFloat((e as HTMLElement).style.getPropertyValue("--tilt-y")) }));
  expect(tilt.x).toBeGreaterThan(0);
  expect(tilt.y).toBeGreaterThan(0);
  expect(Math.abs(tilt.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(tilt.y)).toBeLessThanOrEqual(2);
  await page.mouse.move(0, 0);
  expect(await card.evaluate(e => (e as HTMLElement).style.getPropertyValue("--tilt-x"))).toBe("0deg");
  expect(await card.evaluate(e => (e as HTMLElement).style.getPropertyValue("--tilt-y"))).toBe("0deg");
});
