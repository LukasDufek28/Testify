// Local development storage only. Hosted deployments continue to use Neon.
import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashPassword } from './auth.js';

let connection;
async function open() {
  const directory=resolve('.local/testify-demo');
  await mkdir(directory,{recursive:true});
  const db=new PGlite(directory);
  await db.exec(await readFile(new URL('../auth-schema.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../mcp-schema.sql',import.meta.url),'utf8'));
  const existing=await db.query('SELECT id FROM testify_accounts WHERE email=$1',['demo@testify.local']);
  if(!existing.rows.length)await db.query('INSERT INTO testify_accounts(id,email,password_hash) VALUES(gen_random_uuid(),$1,$2)',['demo@testify.local',await hashPassword('Testify-Demo-2026!')]);
  return db;
}
export async function localDemoSql(strings,...values) {
  if(process.env.TESTIFY_LOCAL_DEMO!=='1'||process.env.NODE_ENV==='production'||process.env.VERCEL)throw new Error('Local demo database is disabled.');
  connection??=open();
  const db=await connection;
  return (await db.query(strings.reduce((text,part,i)=>text+(i?`$${i}`:'')+part,''),values)).rows;
}
