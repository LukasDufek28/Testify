import { test, expect, type Page } from "@playwright/test";
import { exampleStrategy } from "../../src/types";
import { duplicateStrategyName, latestStrategyRuns, parseStrategyImport } from "../../src/strategyLibrary";
import type { Run } from "../../src/types";

async function importJson(page: Page, value: unknown) {
  await page.getByLabel("Import strategy JSON file").setInputFiles({ name: "rules.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/markets", route => route.fulfill({ json: { markets: [{ id: "BTC-USD" }] } }));
});

test("desktop library toolbar stays on one row and cards reflow on smaller windows", async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/#/app/strategies");
  await importJson(page,[exampleStrategy,{...exampleStrategy,name:"Other rules"}]);
  await expect(page.locator(".strategy-card")).toHaveCount(2);
  const boxes=await Promise.all([
    page.getByPlaceholder("Search by name, market or timeframe").boundingBox(),
    page.getByRole("combobox",{name:"Filter strategies by market",exact:true}).boundingBox(),
    page.getByRole("button",{name:"Import JSON",exact:true}).boundingBox(),
    page.getByRole("button",{name:"Export selected",exact:true}).boundingBox(),
  ]);
  const bottoms=boxes.map(box=>box!.y+box!.height);
  expect(Math.max(...bottoms)-Math.min(...bottoms)).toBeLessThanOrEqual(3);
  for(const width of [320,390,768,1024,1440,1920]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("library helpers validate whole batches, bound duplicate names and select the latest run", () => {
  expect(() => parseStrategyImport("{broken")).toThrow("Invalid JSON");
  expect(() => parseStrategyImport(JSON.stringify([exampleStrategy, {}]))).toThrow("Strategy 2");
  expect(() => parseStrategyImport("[]")).toThrow("no strategies");
  expect(() => parseStrategyImport(JSON.stringify(Array(101).fill(exampleStrategy)))).toThrow("100 strategies");
  expect(parseStrategyImport(JSON.stringify({source:JSON.stringify(exampleStrategy)}))).toEqual([exampleStrategy]);
  const first = duplicateStrategyName("x".repeat(100), []);
  expect(first.length).toBe(100);
  expect(duplicateStrategyName("x".repeat(100), [{id:"s",name:first,source:"",updatedAt:1}])).toMatch(/ copy 2$/);
  const runs = [{id:"old",strategyId:"s",createdAt:1},{id:"new",strategyId:"s",createdAt:3},{id:"middle",strategyId:"s",createdAt:2}] as Run[];
  expect(latestStrategyRuns(runs).get("s")?.id).toBe("new");
});

test("empty library creates a draft and invalid batches never partially import", async ({ page }) => {
  await page.goto("/#/app/strategies");
  await expect(page.getByRole("heading", { name: "Your first strategy starts here" })).toBeVisible();
  await importJson(page, [exampleStrategy, { ...exampleStrategy, allocationPct: 120 }]);
  await expect(page.getByRole("alert")).toContainText("Strategy 2");
  await expect(page.locator(".strategy-card")).toHaveCount(0);
  await importJson(page, exampleStrategy);
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Create strategy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Strategy creation", exact: true })).toBeVisible();
  await expect(page.locator(".editor-toolbar")).toContainText("New draft");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  await expect(page.locator(".strategy-card")).toHaveCount(2);
  await expect(page.locator(".strategy-card")).toContainText(["New strategy", exampleStrategy.name]);
});

test("delete requires confirmation, Escape and Cancel preserve data, confirmed delete preserves runs", async ({ page }) => {
  await page.goto("/#/app/strategies");
  await importJson(page, exampleStrategy);
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("testify-local-v1", 1);
      req.onsuccess = () => { const db = req.result; const tx = db.transaction("runs", "readwrite"); tx.objectStore("runs").put({id:"retained-run",strategySource:"immutable snapshot"}); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
  });
  const openConfirmation = async () => {
    await page.locator(".strategy-card summary").click();
    await page.getByRole("button", {name:"Delete strategy",exact:true}).click();
    await expect(page.getByRole("dialog", {name:"Delete strategy?"})).toBeVisible();
  };
  await openConfirmation();
  await expect(page.getByRole("button", {name:"Cancel",exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await openConfirmation();
  await page.getByRole("button", {name:"Cancel",exact:true}).click();
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await openConfirmation();
  await page.getByRole("dialog").getByRole("button", {name:"Delete strategy",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".strategy-card")).toHaveCount(0);
  const snapshot = await page.evaluate(async () => new Promise(resolve => { const req = indexedDB.open("testify-local-v1",1); req.onsuccess=()=>{const db=req.result;const read=db.transaction("runs").objectStore("runs").get("retained-run");read.onsuccess=()=>{db.close();resolve(read.result.strategySource);};}; }));
  expect(snapshot).toBe("immutable snapshot");
});

test("failed delete keeps the confirmation open and can be retried", async ({ page }) => {
  await page.goto("/#/app/strategies"); await importJson(page, exampleStrategy);
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await page.evaluate(() => { const original=IDBObjectStore.prototype.delete; let fail=true; IDBObjectStore.prototype.delete=function(key) { if(fail) {fail=false;throw new Error("Could not delete. Try again.");} return original.call(this,key); }; });
  await page.locator(".strategy-card summary").click();
  await page.getByRole("button", {name:"Delete strategy",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("button", {name:"Delete strategy",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("Could not delete");
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await dialog.getByRole("button", {name:"Delete strategy",exact:true}).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator(".strategy-card")).toHaveCount(0);
});

test("deleted selections cannot export and repeated duplicates remain valid", async ({ page }) => {
  await page.goto("/#/app/strategies"); await importJson(page, exampleStrategy);
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  const original=page.getByRole("article",{name:exampleStrategy.name,exact:true});
  await original.getByRole("button",{name:"Duplicate",exact:true}).click();
  await expect(page.locator(".strategy-card")).toHaveCount(2);
  await original.getByRole("button",{name:"Duplicate",exact:true}).click();
  await expect(page.getByRole("heading",{name:`${exampleStrategy.name} copy 2`,exact:true})).toBeVisible();
  await original.getByRole("checkbox").check();
  await expect(page.getByRole("button",{name:"Export selected",exact:true})).toBeEnabled();
  await original.locator("summary").click(); await original.getByRole("button",{name:"Delete strategy",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Delete strategy",exact:true}).click();
  await expect(page.getByRole("button",{name:"Export selected",exact:true})).toBeDisabled();
  await page.getByPlaceholder("Search by name, market or timeframe").fill("no-match");
  await expect(page.getByRole("heading",{name:"No matching strategies"})).toBeVisible();
  await page.getByRole("button",{name:"Clear filters",exact:true}).click(); await expect(page.locator(".strategy-card")).toHaveCount(2);
});

test("selected strategy opens setup and its latest run metadata is searchable with consistent performance colors", async ({ page }) => {
  await page.goto("/#/app/strategies"); await importJson(page, [{...exampleStrategy,name:"First"},{...exampleStrategy,name:"Second"}]);
  await expect(page.locator(".strategy-card")).toHaveCount(2);
  const browserErrors: string[] = []; page.on("pageerror", error => browserErrors.push(error.message));
  await page.evaluate(async () => { await new Promise<void>(resolve=>{const req=indexedDB.open("testify-local-v1",1);req.onsuccess=()=>{const db=req.result;const tx=db.transaction(["strategies","runs"],"readwrite");const read=tx.objectStore("strategies").getAll();read.onsuccess=()=>{for(const s of read.result)tx.objectStore("runs").put({id:s.id+"-run",name:s.name,createdAt:1,symbol:s.name==="First"?"BTC-USD":"ETH-USD",granularity:900,strategyId:s.id,strategyName:s.name,settings:{capital:10000,start:1735689600,end:1735776000,feeBps:2,slippageBps:1,useMt5Spread:false},curve:[],trades:[],warnings:[],metrics:{netReturnPct:s.name==="First"?12:-2,maxDrawdownPct:2,sharpe:null,winRatePct:50,tradeCount:2,totalFees:0}});};tx.oncomplete=()=>{db.close();resolve();};};}); });
  await page.reload();
  await expect(page.locator(".strategy-last-test .animated-value")).toHaveCount(2);
  await expect(page.getByRole("article",{name:"First",exact:true}).locator(".strategy-last-test .animated-value")).toHaveCSS("color","rgb(255, 255, 255)");
  await expect(page.getByRole("article",{name:"Second",exact:true}).locator(".strategy-last-test .animated-value")).toHaveCSS("color","rgb(254, 243, 234)");
  await page.getByPlaceholder("Search by name, market or timeframe").fill("ETH-USD 15m");
  await expect(page.locator(".strategy-card")).toHaveCount(1);
  await page.locator(".strategy-card summary").click(); await page.getByRole("button",{name:"New backtest",exact:true}).click();
  await expect(page.getByRole("heading",{name:"New backtest",exact:true})).toBeVisible();
  await expect(page.getByRole("combobox",{name:"Strategy and version",exact:true})).toContainText("Second");
  await page.reload(); await expect(page.getByRole("combobox",{name:"Strategy and version",exact:true})).toContainText("Second");
  expect(browserErrors).toEqual([]);
});

test("loading and failed library reads show separate states and retry recovers", async ({ page }) => {
  await page.addInitScript(() => {
    const original=indexedDB.open.bind(indexedDB);let fail=true;
    indexedDB.open=((...args: Parameters<typeof original>)=>{if(!fail)return original(...args); fail=false;const fake={error:new Error("Storage temporarily unavailable"),onerror:null as null|(()=>void)}; (window as unknown as {failLibraryRead:()=>void}).failLibraryRead=()=>fake.onerror?.();return fake as unknown as IDBOpenDBRequest;}) as typeof indexedDB.open;
  });
  await page.goto("/#/app/strategies");
  await expect(page.getByText("Loading your strategies…",{exact:false})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Your first strategy starts here"})).toHaveCount(0);
  await page.evaluate(() => (window as unknown as {failLibraryRead:()=>void}).failLibraryRead());
  await expect(page.getByRole("alert")).toContainText("Storage temporarily unavailable");
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Your first strategy starts here"})).toBeVisible();
});

test('selection uses foundation checkboxes and never shifts strategy cards',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/#/app/strategies');await importJson(page,[exampleStrategy,{...exampleStrategy,name:'Second'}]);
 await expect(page.locator('.strategy-card')).toHaveCount(2);await page.waitForTimeout(700);
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  const card=page.locator('.strategy-card').first(),checkbox=card.getByRole('checkbox');
  const before=await card.boundingBox();await checkbox.check();
  await expect(checkbox).toHaveCSS('appearance','none');await expect(checkbox).toHaveCSS('background-color','rgb(242, 132, 47)');expect(await checkbox.evaluate(el=>getComputedStyle(el,'::after').borderBottomColor)).toBe('rgb(255, 255, 255)');
  const clear=page.getByRole('button',{name:'Clear selection (1)',exact:true});await expect(clear).toBeVisible();await expect(clear).toHaveCSS('border-top-color','rgb(69, 91, 138)');
  const after=await card.boundingBox();expect(after!.y).toBeCloseTo(before!.y,1);expect(after!.x).toBeCloseTo(before!.x,1);
  await clear.click();await expect(checkbox).not.toBeChecked();await expect(page.getByRole('button',{name:'Clear selection (0)',exact:true})).toHaveCount(0);
  expect((await card.boundingBox())!.y).toBeCloseTo(before!.y,1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
});
