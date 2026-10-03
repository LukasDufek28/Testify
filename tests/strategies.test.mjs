import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createStrategiesHandler } from "../api/strategies.js";
import { exampleStrategy } from "../lib/shared/types.js";

test("cloud strategies enforce ownership, preserve revisions and reject stale concurrent saves", async () => {
  const db = new PGlite();
  await db.exec(await readFile(new URL("../auth-schema.sql", import.meta.url), "utf8"));
  const sql = async (strings, ...values) => (await db.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""), values)).rows;
  const alice = "00000000-0000-4000-8000-000000000001", bob = "00000000-0000-4000-8000-000000000002";
  await db.query("INSERT INTO testify_accounts (id,email,password_hash) VALUES ($1,'alice@example.com','test'),($2,'bob@example.com','test')", [alice,bob]);
  const handler = createStrategiesHandler(() => sql, async (req) => ({ id: req.testUser }));
  const call = async (user, method, body, query = {}) => {
    const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(c) { this.statusCode=c;return this; }, json(value) { this.body=value;return this; } };
    await handler({ testUser:user, method, body, query }, res); return res;
  };
  const source = JSON.stringify(exampleStrategy), initial = { id:"my-strategy", source, expectedRevision:0 };
  try {
    const a = await call(alice,"PUT",initial); assert.equal(a.statusCode,200); assert.equal(a.body.strategy.revision,1);
    assert.deepEqual((await call(bob,"GET")).body.strategies,[]);
    assert.equal((await call(bob,"DELETE",{ id:initial.id, expectedRevision:1 })).statusCode,409);
    const b = await call(bob,"PUT",initial); assert.equal(b.statusCode,200);
    const changes = [2,3].map((allocationPct) => call(alice,"PUT",{ ...initial, expectedRevision:1, source:JSON.stringify({...exampleStrategy,allocationPct}) }));
    const results = await Promise.all(changes);
    assert.deepEqual(results.map((r)=>r.statusCode).sort(),[200,409]);
    assert.equal((await call(alice,"GET")).body.strategies[0].revision,2);
    assert.equal((await call(bob,"GET")).body.strategies[0].revision,1);
    const versions = (await call(alice,"GET",null,{ versions:"1",id:initial.id })).body.versions;
    assert.deepEqual(versions.map((v)=>v.revision),[2,1]);
    assert.equal(JSON.parse(versions[1].source).allocationPct,exampleStrategy.allocationPct);
    assert.equal((await call(alice,"PUT",{...initial,source:"{}"})).statusCode,400);
    assert.equal((await call(alice,"DELETE",{id:initial.id,expectedRevision:1})).statusCode,409);
    assert.equal((await call(alice,"DELETE",{id:initial.id,expectedRevision:2})).statusCode,200);
    assert.equal((await call(alice,"GET",null,{versions:"1",id:initial.id})).body.versions.length,0);
    assert.equal((await call(bob,"GET")).body.strategies.length,1);
  } finally { await db.close(); }
});
