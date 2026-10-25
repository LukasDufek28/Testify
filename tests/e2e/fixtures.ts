import {test as base, expect, type Page} from '@playwright/test';
export async function selectWorkspaceOption(page:Page,name:string,option:string|{label:string}){
 const trigger=page.getByRole('combobox',{name,exact:true});
 if(await trigger.evaluate(el=>el.tagName==='SELECT')){await trigger.selectOption(option);return;}
 await trigger.click();
 if(typeof option==='string')await page.locator('[role="option"][data-value='+JSON.stringify(option)+']').click();
 else await page.getByRole('option',{name:option.label,exact:true}).click();
}
export async function clickWorkspaceButton(page:Page,name:string){
 await expect(page.locator('.penpot-workspace')).toBeVisible();
 const destination=page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name,exact:true});
 const button=await destination.count()?destination:page.getByRole('button',{name,exact:true});
 if(!await button.isVisible())await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await button.click();
 if(name==='Open AI assistant'&&await page.getByRole('button',{name:'Close navigation',exact:true}).isVisible())await page.getByRole('button',{name:'Close navigation',exact:true}).click();
}
export * from '@playwright/test';
// Static-layout checks opt out explicitly; the product now defaults to full
// motion even when the operating system requests reduced motion.
export async function reduceTestMotion(page:Page){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('testify-motion-v1','reduced'));
 if(page.url().startsWith('http'))await page.evaluate(()=>{
  localStorage.setItem('testify-motion-v1','reduced');window.dispatchEvent(new StorageEvent('storage',{key:'testify-motion-v1',newValue:'reduced'}));
 });
}
export const test=base.extend<{signedIn:boolean}>({
 signedIn:[true,{option:true}],
 page:async({page,signedIn},use)=>{
  let user=signedIn?{id:'e2e-user',email:'adam@example.test',sessionId:'e2e-session'}:null;
  await page.route('**/api/auth',async route=>{
   const body=route.request().method()==='POST'?route.request().postDataJSON():null;
   if(body?.action==='logout')user=null;
   else if(body?.action==='login'||body?.action==='register')user={id:body.email.startsWith('bob')?'e2e-bob':'e2e-user',email:body.email,sessionId:'e2e-session'};
   await route.fulfill({json:{user,previewGuest:false}});
  });
  await page.route('**/api/research-cloud?*',route=>route.fulfill({json:{runs:[],nextOffset:null}}));
  await page.route('**/api/markets',route=>route.fulfill({json:{markets:[{id:'BTC-USD',base:'BTC',quote:'USD'}],source:'Coinbase Exchange'}}));
  const records=new Map<string,Map<string,any>>();
  await page.route('**/api/workspace**',async route=>{
    const method=route.request().method();const body=method==='GET'?null:route.request().postDataJSON();
    const kind=body?.kind||new URL(route.request().url()).searchParams.get('kind');
    const key=user?.id+':'+kind;if(!records.has(key))records.set(key,new Map());const store=records.get(key)!;
    if(method==='GET'){
      if(['datasets','runs'].includes(kind)){
        try{const cached=await page.evaluate(async({kind,userId})=>new Promise<any[]>((resolve)=>{const req=indexedDB.open('testify-user-'+userId,1);req.onupgradeneeded=()=>{for(const name of ['strategies','datasets','runs'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};req.onsuccess=()=>{const db=req.result,tx=db.transaction(kind,'readonly'),get=tx.objectStore(kind).getAll();get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close();};req.onerror=()=>resolve([]);}),{kind,userId:user?.id});for(const record of cached)store.set(record.id,record);}catch{}
      }
      return route.fulfill({json:{records:[...store.values()]}});
    }
    if(method==='DELETE'){store.delete(body.id);return route.fulfill({json:{ok:true}});}
    store.set(body.record.id,body.record);return route.fulfill({json:{record:body.record}});
  });
  await page.route('**/api/strategies',async route=>{
   if(!user)return route.fulfill({status:401,json:{error:'Please sign in again.'}});
   if(route.request().headers()['x-testify-session']!==user.sessionId)return route.fulfill({status:401,json:{error:'Session mismatch'}});
   const method=route.request().method();const body=method==='GET'?null:route.request().postDataJSON();
   try {
    const result=await page.evaluate(async({method,body,userId})=>new Promise<any>((resolve,reject)=>{
     const request=indexedDB.open(`testify-user-${userId}`,1);
     request.onupgradeneeded=()=>{for(const name of ['strategies','datasets','runs'])request.result.createObjectStore(name,{keyPath:'id'});};
     request.onerror=()=>reject(request.error);
     request.onsuccess=()=>{const db=request.result;const tx=db.transaction('strategies',method==='GET'?'readonly':'readwrite');const store=tx.objectStore('strategies');let response:any;
      if(method==='GET'){const get=store.getAll();get.onsuccess=()=>response={strategies:get.result};}
      else{const get=store.get(body.id);get.onsuccess=()=>{const previous=get.result;if((previous?.revision??0)!==body.expectedRevision){response={error:'Strategy changed. Refresh before saving.',status:409};return;}if(method==='DELETE'){store.delete(body.id);response={ok:true};}else{const parsed=JSON.parse(body.source);const strategy={id:body.id,name:parsed.name,source:body.source,updatedAt:Date.now(),revision:(previous?.revision??0)+1};store.put(strategy);response={strategy};}};}
      tx.oncomplete=()=>{db.close();resolve(response);};tx.onabort=()=>reject(tx.error);
     };
    }),{method,body,userId:user.id});
    await route.fulfill({status:result.status??200,json:result});
   }catch{await route.fulfill({status:503,json:{error:'Could not open browser storage. Try again.'}});}
  });
  await use(page);
 }
});
export {expect};
