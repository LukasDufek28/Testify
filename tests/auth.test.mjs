import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createAuthHandler } from "../api/auth.js";
import { createRequireUser, hashPassword, verifyPassword, cookieName, limit } from "../lib/auth.js";
import { createGenerationHandler } from "../api/generate-strategy.js";
const reply = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("custom auth separates concurrent accounts, rejects forgery, expires and revokes sessions", async () => {
  process.env.AUTH_SECRET = "test-only-secret-that-is-at-least-32-characters";
  process.env.APP_ORIGINS = "https://testify.example";
  const db = new PGlite();
  await db.exec(await readFile(new URL("../auth-schema.sql", import.meta.url), "utf8"));
  const sql = async (strings, ...values) => (await db.query(strings.reduce((result, value, i) => result + (i ? `$${i}` : "") + value, ""), values)).rows;
  const handler = createAuthHandler(() => sql), protect = createRequireUser(() => sql);
  const request = (action, email, cookie, origin = "https://testify.example") => ({ method: action ? "POST" : "GET", headers: { origin, cookie }, socket: { remoteAddress: "127.0.0.1" }, body: { action, email, password: "a-secure-test-password" } });
  const call = async (req) => { const res = reply(); await handler(req, res); return res; };
  try {
    const [alice, bob] = await Promise.all([call(request("register", "Alice@example.com")), call(request("register", "bob@example.com"))]);
    assert.equal(alice.statusCode, 200); assert.equal(bob.statusCode, 200);
    assert.notEqual(alice.body.user.id, bob.body.user.id);
    const ac = alice.headers["Set-Cookie"].split(";")[0], bc = bob.headers["Set-Cookie"].split(";")[0];
    assert.match(alice.headers["Set-Cookie"], /HttpOnly; SameSite=Lax/);
    assert.equal((await call(request(null, null, ac))).body.user.email, "alice@example.com");
    assert.equal((await call(request(null, null, bc))).body.user.email, "bob@example.com");
    const stored = (await db.query("SELECT password_hash FROM testify_accounts")).rows;
    assert.equal(stored.length, 2); assert.ok(stored.every((row) => row.password_hash.startsWith("scrypt$") && !row.password_hash.includes("a-secure-test-password")));
    const tokens = (await db.query("SELECT token_hash FROM testify_sessions")).rows;
    assert.ok(tokens.every((row) => !ac.includes(row.token_hash) && !bc.includes(row.token_hash)));
    assert.equal((await call(request("register", "alice@example.com"))).statusCode, 400);
    const wrong = request("login", "bob@example.com"); wrong.body.password = "wrong-test-password";
    assert.equal((await call(wrong)).statusCode, 401);
    assert.equal((await call(request("login", "bob@example.com", null, "https://evil.example"))).statusCode, 403);
    assert.equal((await call(request(null, null, `${cookieName()}=${"f".repeat(64)}`))).body.user, null);
    const req = request(null, null, ac); req.headers["x-testify-session"] = bob.body.user.sessionId;
    const mismatch = reply(); assert.equal(await protect(req, mismatch, "tools"), null); assert.equal(mismatch.statusCode, 401);
    const valid = reply(); assert.equal((await protect(request(null, null, bc), valid, "tools")).id, bob.body.user.id);
    const staleLogout = request("logout", null, bc); staleLogout.headers["x-testify-session"] = alice.body.user.sessionId;
    assert.equal((await call(staleLogout)).statusCode, 401);
    assert.equal((await call(request(null, null, bc))).body.user.id, bob.body.user.id);
    await call(request("logout", null, ac));
    assert.equal((await call(request(null, null, ac))).body.user, null);
    assert.equal((await call(request(null, null, bc))).body.user.id, bob.body.user.id);
    await db.query("UPDATE testify_sessions SET expires_at = now() - interval '1 second'");
    assert.equal((await call(request(null, null, bc))).body.user, null);
    const denied = reply(); await createGenerationHandler(protect)(request("generate", null, bc), denied);
    assert.equal(denied.statusCode, 401);
    // Separate users get independent distributed counters; simultaneous requests count atomically.
    const result = await Promise.allSettled(Array.from({ length: 8 }, () => limit(sql, "concurrent-test", "alice", 5)));
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 5);
    assert.equal(result.filter((r) => r.status === "rejected").length, 3);
    await assert.doesNotReject(limit(sql, "concurrent-test", "bob", 5));
  } finally { await db.close(); delete process.env.AUTH_SECRET; delete process.env.APP_ORIGINS; }
});

test("password hashes use unique salts and validate only the original password", async () => {
  const a = await hashPassword("a-long-test-password"), b = await hashPassword("a-long-test-password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("a-long-test-password", a), true);
  assert.equal(await verifyPassword("another-long-password", a), false);
});
