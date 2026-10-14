import { neon } from "@neondatabase/serverless";
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
const SESSION_SECONDS = 7 * 86400;
export class AuthError extends Error { constructor(message, status = 401) { super(message); this.status = status; } }
export function database() {
  if (process.env.TESTIFY_LOCAL_DEMO === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    return async (strings, ...values) => (await import("./local-demo.js")).localDemoSql(strings, ...values);
  }
  if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new AuthError("Account service is not configured yet.", 503);
  return neon(process.env.DATABASE_URL);
}
export function checkOrigin(req) {
  const allowed = (process.env.APP_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.VERCEL_URL) allowed.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.NODE_ENV !== "production") allowed.push("http://localhost:5173", "http://localhost:3000");
  if (!allowed.includes(req.headers.origin)) throw new AuthError("Requests must come from Testify.", 403);
}
export function credentials(body) {
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body?.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Enter a valid email address.", 400);
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new AuthError("Use a password between 12 and 128 characters.", 400);
  return { email, password };
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [, salt, hex] = encoded.split("$");
  const expected = Buffer.from(hex, "hex");
  const actual = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const production = () => process.env.NODE_ENV === "production" || !!process.env.VERCEL;
export const cookieName = () => production() ? "__Host-testify_session" : "testify_session";
export function cookieToken(req) {
  const value = String(req.headers.cookie || "").split(";").map((s) => s.trim()).find((s) => s.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
const digest = (token) => createHash("sha256").update(token).digest("hex");
export function setCookie(res, token, seconds = SESSION_SECONDS) {
  res.setHeader("Set-Cookie", `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${production() ? "; Secure" : ""}`);
}
export async function newSession(sql, userId) {
  const token = randomBytes(32).toString("hex"), id = randomUUID();
  await sql`INSERT INTO testify_sessions (id, user_id, token_hash, expires_at) VALUES (${id}, ${userId}, ${digest(token)}, now() + interval '7 days')`;
  return { id, token };
}
export async function session(req, sql = database()) {
  const token = cookieToken(req);
  if (!token) return null;
  const rows = await sql`SELECT u.id, u.email, s.id AS session_id FROM testify_sessions s JOIN testify_accounts u ON u.id = s.user_id WHERE s.token_hash = ${digest(token)} AND s.expires_at > now()`;
  return rows[0] || null;
}
export async function revokeSession(req, sql) {
  const token = cookieToken(req);
  if (token) await sql`DELETE FROM testify_sessions WHERE token_hash = ${digest(token)}`;
}
export async function limit(sql, scope, identity, maximum) {
  const key = createHmac("sha256", process.env.AUTH_SECRET).update(`${scope}:${identity}`).digest("hex");
  const bucket = Math.floor(Date.now() / 60000);
  const rows = await sql`INSERT INTO testify_auth_limits (key, bucket, count) VALUES (${key}, ${bucket}, 1) ON CONFLICT (key) DO UPDATE SET bucket = EXCLUDED.bucket, count = CASE WHEN testify_auth_limits.bucket = EXCLUDED.bucket THEN testify_auth_limits.count + 1 ELSE 1 END RETURNING count`;
  if (Number(rows[0].count) > maximum) throw new AuthError("Please wait a minute and try again.", 429);
}
export function createRequireUser(connect = database) {
return async function requireUser(req, res, scope, maximum = 90) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    if (req.method !== "GET") checkOrigin(req);
    const sql = connect(), user = await session(req, sql);
    if (user && req.headers["x-testify-session"] && req.headers["x-testify-session"] !== user.session_id) throw new AuthError("Your session changed. Please sign in again.");
    if (!user) throw new AuthError("Your session has expired. Please sign in again.");
    await limit(sql, scope, user.id, maximum);
    return user;
  } catch (error) { authFailure(res, error); return null; }
}
}
export const requireUser = createRequireUser();
export function authFailure(res, error) {
  const status = error instanceof AuthError ? error.status : 503;
  if (status === 429) res.setHeader("Retry-After", "60");
  return res.status(status).json({ error: error instanceof AuthError ? error.message : "Account service is temporarily unavailable. Try again shortly." });
}
