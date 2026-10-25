import {test, expect,reduceTestMotion} from "./fixtures";
import { exampleStrategy } from "../../src/types";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", (r) =>
    r.fulfill({ json: { markets: [{ id: "BTC-USD" }] } }),
  );
});
test("empty dashboard retains approved geometry without sample performance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/app/overview");
  await expect(
    page.getByRole("heading", { name: "Hello, Adam!", exact: true }),
  ).toBeVisible();
  await expect(page.locator('.design-main[aria-busy="false"]')).toBeVisible();
  await expect(page.getByText("Your performance starts here", { exact: true })).toBeVisible();
  await expect(page.locator('.design-metric-value strong')).toHaveText(['—','—','—']);
  const b = await page.locator(".design-dashboard-grid").boundingBox();
  expect(b!.x).toBe(266);
  expect(b!.y).toBe(178);
  for (const width of [320, 390, 640, 850, 960, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  const counts = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const q = indexedDB.open("testify-user-e2e-user", 1);
        q.onsuccess = () => {
          const db = q.result,
            tx = db.transaction(["strategies", "runs"]),
            a = tx.objectStore("strategies").count(),
            b = tx.objectStore("runs").count();
          tx.oncomplete = () => {
            db.close();
            resolve([a.result, b.result]);
          };
        };
      }),
  );
  expect(counts).toEqual([0, 0]);
});
test("dashboard actions open the existing editor and advanced settings", async ({
  page,
}) => {
  await page.goto("/#/app/overview");
  await page
    .locator(".design-continue")
    .getByRole("button", { name: "Create strategy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Strategy creation", exact: true }),
  ).toBeVisible();
  await page.goto("/#/app/overview");
  await page
    .getByRole("button", { name: "Set up a backtest", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Run backtest", exact: true }),
  ).toBeVisible();
});
test("JSON import rejects invalid files and persists saved rules", async ({
  page,
}) => {
  await page.goto("/#/app/strategies");
  const input = page.getByLabel("Import strategy JSON file");
  await input.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await input.setInputFiles({
    name: "rules.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...exampleStrategy, name: "Imported rules" }),
    ),
  });
  await expect(page.locator(".strategy-card")).toContainText("Imported rules");
  await page.reload();
  await expect(page.locator(".strategy-card")).toHaveCount(1);
});
test("saved results replace preview metrics and monthly values", async ({
  page,
}) => {
  await page.goto("/#/app/overview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const q = indexedDB.open("testify-user-e2e-user", 1);
      q.onsuccess = () => {
        const db = q.result,
          tx = db.transaction("runs", "readwrite");
        tx.objectStore("runs").put({
          id: "actual",
          name: "Actual run",
          createdAt: 1,
          symbol: "ETH-USD",
          strategyId: "s",
          strategyName: "Actual rules",
          settings: { capital: 10000, start: 1735689600, end: 1738368000 },
          metrics: {
            netReturnPct: 12,
            maxDrawdownPct: 3,
            tradeCount: 0,
            sharpe: 1,
            winRatePct: 0,
            totalFees: 0,
          },
          curve: [
            { time: 1735689600, equity: 10000 },
            { time: 1738368000, equity: 11200 },
          ],
          trades: [],
          warnings: [],
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.reload();
  await expect(
    page.locator('.design-main[aria-busy="false"]'),
  ).toBeVisible();
  await expect(page.locator(".design-final-balance")).toContainText("$11,200");
  await expect(page.locator(".design-metric").first()).toContainText("$1,200");
  await expect(page.locator(".design-live-chart")).toBeVisible();
  await expect(page.locator(".design-monthly")).toContainText("$1,200");
});
test("assistant launcher respects reduced motion and Escape closes its popup", async ({
  page,
}) => {
  await reduceTestMotion(page);
  await page.goto("/#/app/overview");
  const launcher = page.getByRole("button", {
    name: "Open AI assistant",
    exact: true,
  });
  await launcher.hover();
  await expect(launcher).toHaveCSS("transform", "none");
  await launcher.click();
  await expect(
    page.getByRole("dialog", { name: "AI assistant", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test('assistant creates through an explicit site action and saves the strategy to the existing editor',async({page})=>{
  let calls=0;await page.route('**/api/assistant',r=>{calls++;return r.fulfill({json:calls===1?{answer:'',actions:[{id:'create-1',name:'create_strategy',input:{instructions:'Create a crossover',save:true}}],messages:[{role:'assistant',content:[{type:'tool-call',toolCallId:'create-1',toolName:'create_strategy',input:{instructions:'Create a crossover',save:true}}]}]}:{answer:'The strategy is saved.',actions:[],messages:[]}});});
  await page.route('**/api/generate-strategy',r=>r.fulfill({json:{strategy:{...exampleStrategy,name:'AI draft',description:'Draft ready for review'},model:'test'}}));
  await page.goto('/#/app/overview');await page.getByRole('button',{name:'Open AI assistant',exact:true}).click();await page.getByLabel('Message AI assistant').fill('Create and save a crossover');await page.getByRole('button',{name:'Send assistant message',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Strategy creation',exact:true})).toBeVisible();await expect(page.locator('.design-studio-toolbar')).toContainText('AI draft');await expect(page.getByRole('dialog',{name:'AI assistant'})).toContainText('The strategy is saved.');
});
