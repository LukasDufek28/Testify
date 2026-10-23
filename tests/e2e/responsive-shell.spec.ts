import {test,expect,type Page} from './fixtures';

async function verifyShell(page:Page,surface:string,content:string){
  for(const {width,height} of [{width:3440,height:1440},{width:1264,height:843},{width:801,height:600},{width:560,height:900},{width:320,height:700},{width:390,height:844},{width:1101,height:700},{width:1920,height:1080}]){
    await page.setViewportSize({width,height});
    await expect.poll(()=>page.locator(surface).evaluate(el=>{
      const viewport=document.documentElement.clientWidth;
      const elements=[document.body,document.querySelector('#root')!,el];
      return elements.every(element=>{const box=element.getBoundingClientRect();return Math.abs(box.left)<1&&Math.abs(box.width-viewport)<1&&box.height>=innerHeight-1;})&&document.documentElement.scrollWidth<=viewport;
    })).toBe(true);
    await expect(page.locator('html')).toHaveCSS('background-color','rgb(24, 23, 31)');
    if(surface==='.penpot-workspace'&&width>800)await expect(page.getByRole('button',{name:'Close navigation',exact:true})).toBeHidden();
    const box=(await page.locator(content).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width);
    expect(box.width).toBeLessThanOrEqual(content==='.design-main'?1142:1280);
  }
}

for(const route of ['overview','backtests','strategies','studio','data','runsettings','history','compare','validation','portfolio']){
  test(`workspace background and content track viewport changes on ${route}`,async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/#/app/'+route);
    await expect(page.locator('.design-main')).toBeVisible();
    await verifyShell(page,'.penpot-workspace','.design-main');
  });
}

test.describe('public responsive canvas',()=>{
  test.use({signedIn:false});
  for(const route of ['/','/#/app/overview'])test(`public background fills the viewport while content reflows on ${route}`,async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(route);
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await verifyShell(page,'.landing',route==='/'?'.landing-main':'.auth-card');
  });
});
