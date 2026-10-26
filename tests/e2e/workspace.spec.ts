import {selectWorkspaceOption} from './fixtures';
import { test, expect, clickWorkspaceButton } from "./fixtures";
import { exampleStrategy } from "../../src/types";
const strategy = { ...exampleStrategy, name: "My crossover" };
const rows = Array.from({length: 120},(_,i)=>`${1735689600+i*3600},${100+i},${102+i},${99+i},${101+i},20`);
const csv = `time,open,high,low,close,volume\n${rows.join("\n")}`;

test('workspace backup restores account records with fresh strategy revisions and can be repeated safely',async({page})=>{
 const {runBacktest}=await import('../../src/engine');const dataset={id:'backup-data',symbol:'BTC-USD',fileName:'backup.csv',importedAt:1,bars:rows.map(row=>{const [time,open,high,low,close,volume]=row.split(',').map(Number);return {time,open,high,low,close,volume};}),skipped:0};
 const run={...runBacktest(dataset,strategy,{capital:10000,feeBps:2,slippageBps:1,start:1735689600,end:1735689600+120*3600},'backup-strategy','Backup run'),strategySource:JSON.stringify(strategy),datasetId:dataset.id,granularity:3600};
 const backup={format:'testify-backup-v1',datasets:[dataset],strategies:[{id:'backup-strategy',name:strategy.name,source:JSON.stringify(strategy),revision:7,updatedAt:1}],runs:[run]};const file={name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};
 await page.goto('/#/app/data');await page.getByText('Workspace backup',{exact:true}).click();await page.getByLabel('Restore workspace backup file').setInputFiles(file);await expect(page.getByRole('status').filter({hasText:'Restored 3 records'})).toBeVisible();await expect(page.locator('.workspace-table tbody tr')).toHaveCount(1);
 await page.getByLabel('Restore workspace backup file').setInputFiles(file);await expect(page.getByRole('status').filter({hasText:'already contains every record'})).toBeVisible();
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download workspace backup',exact:true}).click();const downloaded=await downloading;const restored=JSON.parse(await(await import('node:fs/promises')).readFile((await downloaded.path())!,'utf8'));expect(restored.strategies).toHaveLength(1);expect(restored.strategies[0].revision).toBe(1);expect(restored.runs).toHaveLength(1);expect(restored.runs[0].curve).toEqual(run.curve);
 const invalid={...backup,datasets:[{...dataset,id:'must-not-be-imported'}],strategies:[{...backup.strategies[0],id:'bad-strategy',source:'{}'}]};await page.getByLabel('Restore workspace backup file').setInputFiles({...file,buffer:Buffer.from(JSON.stringify(invalid))});await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.workspace-table tbody tr')).toHaveCount(1);
});
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
  await clickWorkspaceButton(page,'Strategies');
  await page.reload();
  await expect(page.locator(".strategy-card")).toHaveCount(2);
});

test("CSV data import validates files and runs the real worker on stored candles", async ({page}) => {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/#/app/strategies");
  await page.locator('input[type=file]').setInputFiles({name:"strategy.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(strategy))});
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await clickWorkspaceButton(page,'Data');
  await page.getByLabel('Import historical CSV file').setInputFiles({name:"invalid.csv",mimeType:"text/csv",buffer:Buffer.from("bad,file")});
  await expect(page.locator(".banner.error")).toContainText("Expected CSV columns");
  await page.getByLabel('Import historical CSV file').setInputFiles({name:"history.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".workspace-table")).toContainText("120");
  await page.getByRole("button",{name:"Details →",exact:true}).click();
  await expect(page.getByText("BTC-USD · 120 candles, sorted timestamps and valid prices.",{exact:true})).toBeVisible();
  await clickWorkspaceButton(page,'Run backtest');
  await selectWorkspaceOption(page,"Market / dataset",{label:"BTC-USD · history.csv"});
  await page.reload();
  await expect(page.getByRole("combobox",{name:"Market / dataset",exact:true})).toContainText("history.csv");

  await page.getByRole("button",{name:"Start backtest",exact:true}).click();
  await expect(page.locator(".design-backtest-overview")).toBeVisible();
  await expect(page.locator('.design-result-context [data-run-state=success]')).toContainText('Done');
  await expect(page.locator('.design-notice')).toHaveCount(0);
  await page.route("**/api/candles?**", route=>route.abort());
  await page.getByText("Run details & exports",{exact:false}).click();
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
    const secondary=await button.evaluate(e=>e.matches('.secondary,.subtle,.ghost'));
    await expect(button).toHaveCSS('filter',secondary?'brightness(1.12)':'brightness(1.1)');
    await expect(button).toHaveCSS('min-height','42px');
    if(route==='data')expect(await button.evaluate(e=>getComputedStyle(e,'::after').display)).toBe('none');
  }
});
