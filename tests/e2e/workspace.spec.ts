import { test, expect } from "@playwright/test";
import { exampleStrategy } from "../../src/types";
const strategy = { ...exampleStrategy, name: "My crossover" };
const rows = Array.from({length: 120},(_,i)=>`${1735689600+i*3600},${100+i},${102+i},${99+i},${101+i},20`);
const csv = `time,open,high,low,close,volume\n${rows.join("\n")}`;
test.beforeEach(async ({page}) => {
  await page.route("**/api/markets", route=>route.fulfill({json:{markets:[{id:"BTC-USD"},{id:"ETH-USD"}]}}));
});

test("strategy library imports, searches, duplicates, exports and opens persisted rules", async ({page}) => {
  await page.goto("/#/app/strategies");
  await page.locator('input[type=file]').setInputFiles({name:"strategy.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(strategy))});
  await expect(page.locator(".strategy-card")).toContainText(strategy.name);
  await page.locator(".strategy-card summary").click();await page.getByRole("button",{name:"Duplicate",exact:true}).click();
  await expect(page.locator(".strategy-card")).toHaveCount(2);
  await page.getByPlaceholder("Search strategies...").fill(" copy");
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await page.getByRole("checkbox",{name:`Select ${strategy.name} copy`,exact:true}).check();
  const download = page.waitForEvent("download");
  await page.getByRole("button",{name:"Export selected",exact:true}).click();
  expect((await download).suggestedFilename()).toBe("My-crossover-copy.json");
  await page.getByRole("button",{name:"Open",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Strategy creation",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Strategies",exact:true}).click();
  await page.reload();
  await expect(page.locator(".strategy-card")).toHaveCount(2);
});

test("CSV data import validates files and runs the real worker on stored candles", async ({page}) => {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/#/app/strategies");
  await page.locator('input[type=file]').setInputFiles({name:"strategy.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(strategy))});
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await page.getByRole("button",{name:"Data",exact:true}).click();
  await page.locator('input[type=file]').setInputFiles({name:"invalid.csv",mimeType:"text/csv",buffer:Buffer.from("bad,file")});
  await expect(page.locator(".banner.error")).toContainText("Expected CSV columns");
  await page.locator('input[type=file]').setInputFiles({name:"history.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".workspace-table")).toContainText("120");
  await page.getByRole("button",{name:"Details →",exact:true}).click();
  await expect(page.getByText("BTC-USD · 120 candles, sorted timestamps and valid prices.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Backtests",exact:true}).click();
  await page.getByRole("combobox",{name:"Market / dataset",exact:true}).selectOption({label:"BTC-USD · history.csv"});
  await page.reload();
  await expect(page.getByRole("combobox",{name:"Market / dataset",exact:true})).toContainText("history.csv");

  await page.getByRole("button",{name:"Run backtest",exact:true}).click();
  await expect(page.locator(".backtest-result")).toBeVisible();
  await expect(page.locator(".banner.success")).toContainText("1 backtest saved");
  await page.route("**/api/candles?**", route=>route.abort());
  await page.getByRole("button",{name:"Validate holdout",exact:true}).click();

  await page.getByRole("button",{name:"Validate 1 run",exact:true}).click();
  await expect(page.getByRole("heading",{name:"1 holdout result",exact:true})).toBeVisible();
  await page.goto("/#/app/history");
  await expect(page.locator(".history-table")).toContainText("New research run");
  await page.reload();
  await expect(page.locator(".history-table")).toContainText("New research run");
  expect(errors).toEqual([]);
});

test("three screens keep the shared responsive shell and primary hover effects", async ({page}) => {
  for(const route of ["strategies","data","backtests","studio"]){
    await page.goto(`/#/app/${route}`);
    await expect(page.getByRole("heading",{level:1})).toBeVisible();
    for(const width of [320,390,768,960,1280,1440,1920]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    }
    const button=page.locator(".testify-primary,.design-button").filter({visible:true}).first();
    await button.hover();
    if(["strategies","backtests","studio"].includes(route))await expect(button).toHaveCSS("filter","brightness(1.12)");else expect(await button.evaluate(e=>getComputedStyle(e,"::after").animationName)).toBe("landing-glare");
  }
});
