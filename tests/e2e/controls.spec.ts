import { test, expect } from "./fixtures";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", (r) =>
    r.fulfill({
      json: {
        markets: Array.from({ length: 12 }, (_, i) => ({
          id: i === 0 ? "BTC-USD" : "COIN" + i + "-USD",
        })),
      },
    }),
  );
});
test("secondary buttons brighten without moving", async ({ page }) => {
  await page.goto("/#/app/backtests");
  const b = page
    .locator(".design-run-simple")
    .getByRole("button", { name: "Settings", exact: true });
  await b.scrollIntoViewIfNeeded();
  const before = await b.boundingBox();
  await b.hover();
  await expect(b).toHaveCSS("filter", "brightness(1.12)");
  await expect(b).toHaveCSS("transform", "none");
  expect((await b.boundingBox())!.y).toBe(before!.y);
});
test("market and timeframe selections persist into actual run options", async ({
  page,
}) => {
  await page.goto("/#/app/backtests");
  await page.getByLabel("Timeframe", { exact: true }).selectOption("21600");
  await page.getByLabel("Market", { exact: true }).selectOption("COIN9-USD");
  await page.reload();
  await expect(page.getByLabel("Timeframe", { exact: true })).toHaveValue(
    "21600",
  );
  await expect(page.getByLabel("Market", { exact: true })).toHaveValue(
    "COIN9-USD",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("testify-tester-options-v1:e2e-user")!),
  );
  expect(saved.selectedMarkets).toEqual(["COIN9-USD"]);
  expect(saved.granularity).toBe(21600);
});
test("date and execution settings persist across simple and advanced forms", async ({
  page,
}) => {
  await page.goto("/#/app/backtests");
  await page.getByLabel("Start date", { exact: true }).fill("2025-01-02");
  await page
    .locator(".design-run-simple")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue(
    "2025-01-02T00:00",
  );
  await page.getByLabel("Start", { exact: true }).fill("2025-01-03T12:30");
  await page.getByLabel("Fee (basis points)", { exact: true }).fill("4");
  await page.reload();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue(
    "2025-01-03T12:30",
  );
  await expect(
    page.getByLabel("Fee (basis points)", { exact: true }),
  ).toHaveValue("4");
});
test("development slider and instrument checkboxes update the saved summary", async ({
  page,
}) => {
  await page.goto("/#/app/runsettings");
  await page.getByRole("slider", { name: "Development share" }).fill("60");
  await expect(
    page.getByText("Development 60% · Validation 40%", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Uncheck all", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run 0 backtests", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "COIN9-USD", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Run 1 backtests", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "COIN9-USD", exact: true }),
  ).toBeChecked();
});
