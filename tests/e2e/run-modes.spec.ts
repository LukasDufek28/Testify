import {test,expect} from './fixtures';
import {exampleStrategy} from '../../src/types';
import {advanceManual,createManualSession,manualResult,type ManualSession} from '../../src/manual-engine';
const base=1735689600;
const bars=Array.from({length:120},(_,i)=>({time:base+i*3600,open:100,high:101,low:99,close:100,volume:20,spread:0}));
const csv='time,open,high,low,close,volume\n'+bars.map(b=>[b.time,b.open,b.high,b.low,b.close,b.volume].join(',')).join('\n');
async function setup(page:any){
  await page.goto('/#/app/strategies');
  await page.getByLabel('Import strategy JSON file').setInputFiles({name:'rules.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exampleStrategy))});
  await expect(page.locator('.strategy-card')).toHaveCount(1);
  await page.goto('/#/app/data');
  await page.getByLabel('Import historical CSV file').setInputFiles({name:'replay.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await expect(page.locator('.workspace-table tbody tr')).toHaveCount(1);
  await page.goto('/#/app/backtests');
  await page.getByRole('combobox',{name:'Market / dataset',exact:true}).selectOption({label:'BTC-USD · replay.csv'});
}

test('manual controls resume the saved position and form after refresh, then complete into history',async({page})=>{
  await setup(page);
  let session:ManualSession|null=null;const dataset={id:'manual-data',symbol:'BTC-USD',fileName:'replay.csv',bars,skipped:0,importedAt:0,utcOffset:0,point:0};
  await page.route('**/api/replay',async route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON();
      if(body.action==='start'){session=createManualSession({...dataset,id:body.datasetId},{id:body.strategyId,name:exampleStrategy.name,source:JSON.stringify(exampleStrategy)},body.settings,'Manual test');session._revision=1;}
      else {const revision=session!._revision!;session=advanceManual(session!,dataset,body.command);session._revision=revision+1;}
      if(session?.status==='completed')await page.evaluate(async run=>{await new Promise<void>((resolve,reject)=>{const q=indexedDB.open('testify-user-e2e-user',1);q.onsuccess=()=>{const tx=q.result.transaction('runs','readwrite');tx.objectStore('runs').put(run);tx.oncomplete=()=>{q.result.close();resolve();};tx.onerror=()=>reject(tx.error);};});},manualResult(session,dataset));
    }
    await route.fulfill({json:{session,bars:session?bars.slice(0,session.cursor+1):[],totalBars:bars.length,symbol:'BTC-USD'}});
  });
  await page.goto('/#/app/manual');await page.getByRole('button',{name:'Start new replay'}).click();await expect(page.getByText('Candle 1 of 120',{exact:true})).toBeVisible();
  await page.getByLabel('Replay stop loss').fill('95');await page.getByLabel('Replay take profit').fill('110');await page.getByLabel('Replay risk percent').fill('0.5');await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel pending order'})).toBeEnabled();
  await page.getByRole('button',{name:'Next candle'}).click();await expect(page.getByText('Candle 2 of 120',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Close at next open'})).toBeEnabled();
  await page.reload();await expect(page.getByText('Candle 2 of 120',{exact:true})).toBeVisible();await expect(page.getByLabel('Replay stop loss')).toHaveValue('95');await expect(page.getByLabel('Replay take profit')).toHaveValue('110');await expect(page.getByLabel('Replay risk percent')).toHaveValue('0.5');
  for(const width of [320,390,768,1440,3440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.getByRole('button',{name:'Finish replay'}).click();await expect(page.getByText('Replay complete',{exact:true})).toBeVisible();await page.goto('/#/app/history');await expect(page.locator('.history-table')).toContainText('Manual test');
});

test('saved defaults persist costs, risk and timezone, and can be reapplied without editing old runs',async({page})=>{
  await setup(page);await page.goto('/#/app/runsettings');
  await page.getByLabel('Starting capital',{exact:true}).fill('7000');await page.getByLabel('Risk per trade percent').fill('0.5');await page.getByLabel('Spread (basis points)',{exact:true}).fill('4');
  await page.getByText('Saved defaults',{exact:true}).click();await page.getByRole('combobox',{name:'Display timezone'}).click();await page.getByRole('option',{name:'America/New_York',exact:true}).click();await page.getByRole('button',{name:'Save current settings as defaults'}).click();await expect(page.getByRole('status').filter({hasText:'Defaults saved'})).toBeVisible();
  await page.reload();await page.getByLabel('Starting capital',{exact:true}).fill('1000');await page.getByLabel('Risk per trade percent').fill('1');await page.getByLabel('Spread (basis points)',{exact:true}).fill('0');await page.getByText('Saved defaults',{exact:true}).click();await page.getByRole('button',{name:'Apply saved defaults'}).click();
  await expect(page.getByLabel('Starting capital',{exact:true})).toHaveValue('7000');await expect(page.getByLabel('Risk per trade percent')).toHaveValue('0.5');await expect(page.getByLabel('Spread (basis points)',{exact:true})).toHaveValue('4');await expect(page.getByRole('combobox',{name:'Display timezone'})).toContainText('America/New_York');
});

test('batch preserves a completed child on failure and resumes only missing runs after refresh',async({page})=>{
  await setup(page);await page.goto('/#/app/runsettings');
  await page.getByRole('combobox',{name:'Market / dataset',exact:true}).selectOption('online');
  let calls=0,fail=true;
  await page.route('**/api/candles?**',route=>{
    calls++;if(calls===2&&fail)return route.fulfill({status:503,json:{error:'Temporary market failure'}});
    const q=new URL(route.request().url()).searchParams,start=Number(q.get('start')),end=Number(q.get('end'));
    return route.fulfill({json:{bars:bars.filter(b=>b.time>=start&&b.time<=end)}});
  });
  await page.getByText('Parameter and period batches',{exact:true}).click();await page.getByRole('combobox',{name:'Batch parameter'}).click();await page.getByRole('option',{name:'stopLossPct',exact:true}).click();await page.getByLabel('Batch parameter values').fill('1, 2');await page.getByRole('button',{name:'Run batch',exact:true}).click();
  await expect(page.locator('.history-table tbody tr')).toHaveCount(1,{timeout:20000});await expect(page.getByRole('alert')).toContainText('Temporary market failure');
  await page.goto('/#/app/runsettings');await page.reload();await page.getByText('Parameter and period batches',{exact:true}).click();fail=false;
  await page.getByRole('button',{name:'Resume remaining runs',exact:true}).click();await expect(page.locator('.history-table tbody tr')).toHaveCount(2,{timeout:20000});expect(calls).toBe(3);
  await page.reload();await expect(page.locator('.history-table tbody tr')).toHaveCount(2);
});
