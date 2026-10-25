import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkOrigin,AuthError} from '../lib/auth.js';

test('auth accepts the exact deployment and branch origins while rejecting forged preview hosts',()=>{
 const keys=['NODE_ENV','APP_ORIGINS','VERCEL_URL','VERCEL_BRANCH_URL'];const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  Object.assign(process.env,{NODE_ENV:'production',APP_ORIGINS:'https://testify.example',VERCEL_URL:'testify-build123-team.vercel.app',VERCEL_BRANCH_URL:'testify-git-devadam-team.vercel.app'});
  for(const origin of ['https://testify.example','https://testify-build123-team.vercel.app','https://testify-git-devadam-team.vercel.app'])assert.doesNotThrow(()=>checkOrigin({headers:{origin}}));
  for(const origin of [undefined,'null','https://unrelated.vercel.app','http://testify-git-devadam-team.vercel.app','https://testify-git-devadam-team.vercel.app.evil.example'])assert.throws(()=>checkOrigin({headers:{origin,host:'testify-git-devadam-team.vercel.app','x-forwarded-host':'testify-git-devadam-team.vercel.app'}}),error=>error instanceof AuthError&&error.status===403);
 }finally{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
});
