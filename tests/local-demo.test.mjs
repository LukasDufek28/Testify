import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../lib/auth.js';

test('local demo database cannot activate on hosted or production deployments',()=>{
 const saved={...process.env};
 try {
  delete process.env.DATABASE_URL;process.env.TESTIFY_LOCAL_DEMO='1';
  process.env.NODE_ENV='production';delete process.env.VERCEL;
  assert.throws(()=>database(),/not configured/);
  process.env.NODE_ENV='development';process.env.VERCEL='1';
  assert.throws(()=>database(),/not configured/);
 }finally {
  for(const key of ['DATABASE_URL','TESTIFY_LOCAL_DEMO','NODE_ENV','VERCEL']) {
   if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
  }
 }
});
