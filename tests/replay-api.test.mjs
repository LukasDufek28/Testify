import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createReplayHandler} from '../api/replay.js';
import {ensureWorkspaceSchema,putRecord,listRecords} from '../lib/workspace-records.js';
import {exampleStrategy} from '../lib/shared/types.js';
const response=()=>({code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('replay API persists atomic cursor/positions, replays retries once, hides future bars and rejects cross-account access',async()=>{
 const db=new PGlite();const old=process.env.APP_ORIGINS;process.env.APP_ORIGINS='https://testify.test';
 const sql=async(strings,...values)=>(await db.query(strings.reduce((out,s,i)=>out+(i?'$'+i:'')+s,''),values)).rows;
 try{
  await db.exec(await readFile(new URL('../auth-schema.sql',import.meta.url),'utf8'));await ensureWorkspaceSchema(sql);
  const alice=randomUUID(),bob=randomUUID();await sql`INSERT INTO testify_accounts(id,email,password_hash) VALUES(${alice},'a@test.local','hash'),(${bob},'b@test.local','hash')`;
  await sql`INSERT INTO testify_strategies(user_id,id,name,source) VALUES(${alice},'s','SMA',${JSON.stringify(exampleStrategy)})`;
  const dataset={id:'d',symbol:'TEST-USD',fileName:'fixture.csv',bars:Array.from({length:25},(_,i)=>({time:1000+i*60,open:100,high:101,low:99,close:100,volume:1,spread:0})),skipped:0,importedAt:0};await putRecord(sql,alice,'datasets',dataset);
  let user=alice;const handler=createReplayHandler(async()=>({id:user}),()=>sql);
  async function call(body,query={}){const r=response();await handler({method:body?'POST':'GET',headers:{host:'testify.test',origin:'https://testify.test'},body,query},r);return r;}
  const started=await call({action:'start',requestId:randomUUID(),datasetId:'d',strategyId:'s',settings:{capital:1000,feeBps:0,slippageBps:0,start:1000,end:2440}});assert.equal(started.code,200);assert.equal(started.body.bars.length,1);
  let session=started.body.session;const placed=await call({action:'command',requestId:randomUUID(),id:session.id,expectedRevision:session._revision,command:{type:'order',order:{side:1,type:'market',price:100,stop:95,target:110,riskPct:1}}});assert.equal(placed.code,200);session=placed.body.session;
  const command={action:'command',requestId:randomUUID(),id:session.id,expectedRevision:session._revision,command:{type:'step'}};
  const stepped=await call(command);assert.equal(stepped.code,200);assert.equal(stepped.body.bars.length,2);assert.equal(stepped.body.session.position.units,2);
  const retry=await call(command);assert.equal(retry.body.session.cursor,1);assert.equal(retry.body.session._revision,stepped.body.session._revision);
  const conflict=await call({...command,requestId:randomUUID()});assert.equal(conflict.code,409);
  const reopened=await call(null,{id:session.id});assert.equal(reopened.body.session.position.units,2);assert.equal(reopened.body.bars.length,2);
  const finished=await call({action:'command',requestId:randomUUID(),id:session.id,expectedRevision:reopened.body.session._revision,command:{type:'finish'}});assert.equal(finished.code,200);assert.equal(finished.body.session.status,'completed');assert.equal((await listRecords(sql,alice,'runs')).length,1);
  const oldRetry=await call(command);assert.equal(oldRetry.body.session.status,'completed');assert.equal(oldRetry.body.session.cursor,finished.body.session.cursor);
  user=bob;const denied=await call(null,{id:session.id});assert.equal(denied.code,404);assert.equal((await listRecords(sql,bob,'runs')).length,0);
 }finally{await db.close();if(old===undefined)delete process.env.APP_ORIGINS;else process.env.APP_ORIGINS=old;}
});
