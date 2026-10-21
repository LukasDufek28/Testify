import {selectWorkspaceOption} from './fixtures';
import {test,expect} from './fixtures';
import {exampleStrategy} from '../../src/types';
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
  await selectWorkspaceOption(page,"Market / dataset",{label:'BTC-USD · replay.csv'});
}

test('retired replay URL opens the existing trade review without manual trading controls',async({page})=>{
 await page.goto('/#/app/manual');
 await expect(page.getByRole('heading',{name:'Trades & chart',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/#\/app\/trades$/);
 await expect(page.getByRole('button',{name:'Manual replay',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Start new replay',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Place order',exact:true})).toHaveCount(0);
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
  await selectWorkspaceOption(page,"Market / dataset",'online');
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
