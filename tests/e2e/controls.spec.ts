import {selectWorkspaceOption,test,expect} from './fixtures';
test.beforeEach(async({page})=>{await page.route('**/api/markets',r=>r.fulfill({json:{markets:Array.from({length:12},(_,i)=>({id:i===0?'BTC-USD':'COIN'+i+'-USD'}))}}));});

test('searchable dark markets support keyboard selection, no matches and Escape',async({page})=>{
 await page.goto('/#/app/data');const market=page.getByRole('combobox',{name:'CSV market',exact:true});
 await market.click();const search=page.getByRole('combobox',{name:'Search CSV market',exact:true});
 await expect(search).toHaveCSS('outline-color','rgb(163, 148, 229)');await expect(page.locator('.control-popup')).toHaveCSS('background-color','rgb(34, 33, 40)');
 await search.fill('COIN9');await search.press('Enter');await expect(market).toContainText('COIN9-USD');await expect(market).toBeFocused();
 await market.click();await search.fill('missing-market');await search.press('Enter');await expect(page.getByText('No matches',{exact:true})).toBeVisible();await search.press('Escape');await expect(market).toBeFocused();await expect(market).toContainText('COIN9-USD');
 await market.click();await search.fill('COIN');await search.press('End');await search.press('Enter');await expect(market).toContainText('COIN11-USD');
});

test('keyboard selection skips disabled options including filtered search results',async({page})=>{
 await page.goto('/#/app/runsettings');await page.evaluate(async()=>{
 const {default:React}=await import('/node_modules/.vite/deps/react.js'),{default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js'),{AnimatedSelect}=await import('/src/AnimatedControls.tsx');
 const host=document.createElement('div');document.body.append(host);ReactDOM.createRoot(host).render(React.createElement(AnimatedSelect,{'aria-label':'Keyboard fixture',value:'0',onChange:(e:any)=>host.dataset.chosen=e.target.value},Array.from({length:10},(_,i)=>React.createElement('option',{key:i,value:String(i),disabled:i===1},i===1?'Unavailable market':'Available '+i))));
 });const control=page.getByRole('combobox',{name:'Keyboard fixture',exact:true});await control.click();const search=page.getByRole('combobox',{name:'Search Keyboard fixture',exact:true});await search.fill('Unavailable');await search.press('Enter');await expect(control).toHaveAttribute('aria-expanded','true');expect(await control.evaluate(el=>el.parentElement!.parentElement!.dataset.chosen)).toBeUndefined();await search.fill('');await search.press('Home');await search.press('ArrowDown');await search.press('Enter');expect(await control.evaluate(el=>el.parentElement!.parentElement!.dataset.chosen)).toBe('2');
});

test('secondary buttons brighten without moving',async({page})=>{
 await page.goto('/#/app/runsettings');const button=page.locator('.design-settings-footer').getByRole('button',{name:'Overview',exact:true});await button.scrollIntoViewIfNeeded();const before=await button.boundingBox();await button.hover();await expect(button).toHaveCSS('filter','brightness(1.12)');await expect(button).toHaveCSS('transform','none');expect((await button.boundingBox())!.y).toBe(before!.y);
});

test('market and timeframe selections persist into actual run options',async({page})=>{
 await page.goto('/#/app/runsettings');for(const [value,label] of [['1800','30 minutes'],['14400','4 hours'],['21600','6 hours']]){await selectWorkspaceOption(page,'Timeframe',value);await expect(page.getByRole('combobox',{name:'Timeframe',exact:true})).toContainText(label);}
 await page.getByRole('button',{name:'Uncheck all',exact:true}).click();await page.getByRole('checkbox',{name:'COIN9-USD',exact:true}).check();await page.reload();await expect(page.getByRole('combobox',{name:'Timeframe',exact:true})).toContainText('6 hours');await expect(page.getByRole('checkbox',{name:'COIN9-USD',exact:true})).toBeChecked();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('testify-tester-options-v1:e2e-user')!));expect(saved.selectedMarkets).toEqual(['COIN9-USD']);expect(saved.granularity).toBe(21600);
});

test('date and execution settings persist in the single run form',async({page})=>{
 await page.goto('/#/app/runsettings');await page.getByLabel('Start',{exact:true}).fill('2025-01-03T12:30');await page.getByLabel('Fee (basis points)',{exact:true}).fill('4');await page.reload();await expect(page.getByLabel('Start',{exact:true})).toHaveValue('2025-01-03T12:30');await expect(page.getByLabel('Fee (basis points)',{exact:true})).toHaveValue('4');await expect(page.locator('.design-run-simple')).toHaveCount(0);
});

test('development slider and instrument checkboxes update the saved summary',async({page})=>{
 await page.goto('/#/app/runsettings');await page.getByRole('slider',{name:'Development share'}).fill('60');await expect(page.getByText('Development 60% · Validation 40%',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Uncheck all',exact:true}).click();await expect(page.locator('.design-run-summary')).toContainText('0 markets');await expect(page.getByRole('button',{name:'Start backtest',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:'COIN9-USD',exact:true}).check();await expect(page.locator('.design-run-summary')).toContainText('1 markets');await page.reload();await expect(page.getByRole('checkbox',{name:'COIN9-USD',exact:true})).toBeChecked();
});
