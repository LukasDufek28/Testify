import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { AuthError } from "../auth.js";
export const SCOPES = ["testify:read", "testify:strategies", "testify:backtests"];
export const hash = value => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
export function issuer() {
  const url = new URL(process.env.MCP_PUBLIC_URL || "http://localhost:3001");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new AuthError("Invalid MCP public URL.", 503);
  if (url.protocol !== "https:" && !(!process.env.VERCEL && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new AuthError("MCP requires HTTPS.", 503);
  return url.origin;
}
export const resource = () => `${issuer()}/api/mcp`;
export function validateRedirect(value) {
  let url; try { url = new URL(value); } catch { throw new AuthError("Invalid redirect URI.", 400); }
  if (url.username || url.password || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new AuthError("Redirect URI must use HTTPS or loopback HTTP.", 400);
  return url.href;
}
export function validPkce(verifier, challenge) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier || "") || !/^[A-Za-z0-9_-]{43}$/.test(challenge || "")) return false;
  const actual = createHash("sha256").update(verifier).digest("base64url");
  return timingSafeEqual(Buffer.from(actual), Buffer.from(challenge));
}
export async function registerClient(sql, body) {
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 5) throw new AuthError("Provide 1–5 redirect URIs.", 400);
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") throw new AuthError("Only public PKCE clients are supported.", 400);
  const redirects = body.redirect_uris.map(validateRedirect);
  const id = randomUUID(), name = String(body.client_name || "MCP client").slice(0, 100);
  await sql`INSERT INTO testify_mcp_clients (id,name,redirect_uris) VALUES (${id},${name},${JSON.stringify(redirects)}::jsonb)`;
  return { client_id: id, client_name: name, redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}
export async function beginAuthorization(sql, params) {
  const clients = await sql`SELECT * FROM testify_mcp_clients WHERE id=${params.client_id || ""}`;
  const client = clients[0];
  if (!client || !client.redirect_uris.includes(params.redirect_uri)) throw new AuthError("Unknown client or redirect URI.", 400);
  const scopes = String(params.scope || "testify:read").split(/\s+/).filter(Boolean);
  if (params.response_type !== "code" || params.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge || "") || params.resource !== resource() || scopes.some(s => !SCOPES.includes(s)) || String(params.state || "").length > 2048) throw new AuthError("Invalid authorization request. PKCE S256 and resource are required.", 400);
  const id = randomUUID();
  const normalized = { client_id: client.id, redirect_uri: params.redirect_uri, scope: [...new Set(scopes)].join(" "), code_challenge: params.code_challenge, state: params.state || "", resource: resource() };
  await sql`INSERT INTO testify_mcp_requests (id,params,expires_at) VALUES (${id},${JSON.stringify(normalized)}::jsonb,now()+interval '10 minutes')`;
  return id;
}
export async function consentRequest(sql, id) {
  const rows = await sql`SELECT r.params,c.name FROM testify_mcp_requests r JOIN testify_mcp_clients c ON c.id=r.params->>'client_id' WHERE r.id=${id} AND r.used_at IS NULL AND r.expires_at>now()`;
  if (!rows[0]) throw new AuthError("This connection request expired.", 400);
  return { id, clientName: rows[0].name, scopes: rows[0].params.scope.split(" "), redirectUri: rows[0].params.redirect_uri };
}
export async function grantConsent(sql, user, id, allow) {
  if (user.email.endsWith("@preview.testify.invalid")) throw new AuthError("Connect using a real Testify account, not a preview guest.", 403);
  const rows = await sql`UPDATE testify_mcp_requests SET used_at=now() WHERE id=${id} AND used_at IS NULL AND expires_at>now() RETURNING params`;
  if (!rows[0]) throw new AuthError("This connection request expired or was already used.", 400);
  const p = rows[0].params, redirect = new URL(p.redirect_uri);
  redirect.searchParams.set("state", p.state); redirect.searchParams.set("iss", issuer());
  if (!allow) { redirect.searchParams.set("error", "access_denied"); return redirect.href; }
  const grantId = randomUUID(), code = secret();
  await sql.transaction([
    sql`INSERT INTO testify_mcp_grants (id,user_id,client_id,scopes) VALUES (${grantId},${user.id},${p.client_id},${p.scope})`,
    sql`INSERT INTO testify_mcp_codes (hash,grant_id,redirect_uri,challenge,resource,expires_at) VALUES (${hash(code)},${grantId},${p.redirect_uri},${p.code_challenge},${p.resource},now()+interval '2 minutes')`,
  ]);
  redirect.searchParams.set("code", code); return redirect.href;
}
export async function exchangeToken(sql, p) {
  if (p.resource !== resource()) throw new AuthError("Invalid resource.", 400);
  const access = secret(), refresh = secret();
  let grants;
  if (p.grant_type === "authorization_code") {
    const rows = await sql`SELECT c.*,g.client_id FROM testify_mcp_codes c JOIN testify_mcp_grants g ON g.id=c.grant_id WHERE c.hash=${hash(String(p.code || ""))} AND c.expires_at>now() AND g.revoked_at IS NULL`;
    const code = rows[0];
    if (!code || code.client_id !== p.client_id || code.redirect_uri !== p.redirect_uri || code.resource !== p.resource || !validPkce(p.code_verifier, code.challenge)) throw new AuthError("Invalid authorization code or PKCE verifier.", 400);
    grants = await sql`WITH consumed AS (DELETE FROM testify_mcp_codes WHERE hash=${code.hash} AND expires_at>now() RETURNING grant_id),
      a AS (INSERT INTO testify_mcp_tokens(hash,grant_id,kind,resource,expires_at) SELECT ${hash(access)},grant_id,'access',${resource()},now()+interval '15 minutes' FROM consumed),
      r AS (INSERT INTO testify_mcp_tokens(hash,grant_id,kind,resource,expires_at) SELECT ${hash(refresh)},grant_id,'refresh',${resource()},now()+interval '30 days' FROM consumed)
      SELECT g.scopes FROM testify_mcp_grants g JOIN consumed ON consumed.grant_id=g.id`;
  } else if (p.grant_type === "refresh_token") {
    grants = await sql`WITH consumed AS (
      UPDATE testify_mcp_tokens t SET consumed_at=now() FROM testify_mcp_grants g
      WHERE t.hash=${hash(String(p.refresh_token || ""))} AND t.kind='refresh' AND t.resource=${resource()} AND t.expires_at>now() AND t.consumed_at IS NULL AND g.id=t.grant_id AND g.client_id=${String(p.client_id || "")} AND g.revoked_at IS NULL RETURNING t.grant_id),
      a AS (INSERT INTO testify_mcp_tokens(hash,grant_id,kind,resource,expires_at) SELECT ${hash(access)},grant_id,'access',${resource()},now()+interval '15 minutes' FROM consumed),
      r AS (INSERT INTO testify_mcp_tokens(hash,grant_id,kind,resource,expires_at) SELECT ${hash(refresh)},grant_id,'refresh',${resource()},now()+interval '30 days' FROM consumed)
      SELECT g.scopes FROM testify_mcp_grants g JOIN consumed ON consumed.grant_id=g.id`;
  } else throw new AuthError("Unsupported grant type.", 400);
  if (!grants.length) throw new AuthError("Invalid or previously used credential.", 400);
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 900, scope: grants[0].scopes };
}
export async function authenticateToken(sql, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await sql`SELECT g.id AS grant_id,g.user_id,g.scopes FROM testify_mcp_tokens t JOIN testify_mcp_grants g ON g.id=t.grant_id WHERE t.hash=${hash(token)} AND t.kind='access' AND t.resource=${resource()} AND t.expires_at>now() AND g.revoked_at IS NULL`;
  return rows[0] ? { userId: rows[0].user_id, grantId: rows[0].grant_id, scopes: rows[0].scopes.split(" ") } : null;
}
export async function revokeGrant(sql, userId, grantId) {
  await sql.transaction([
    sql`UPDATE testify_mcp_grants SET revoked_at=now() WHERE id=${grantId} AND user_id=${userId}`,
    sql`UPDATE testify_mcp_jobs SET cancel_requested=true,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,updated_at=now() WHERE grant_id=${grantId} AND user_id=${userId} AND status IN ('queued','loading','running','waiting_retry')`,
  ]);
}
export async function revokeToken(sql, p) {
  await sql`UPDATE testify_mcp_grants SET revoked_at=now() WHERE id IN (SELECT grant_id FROM testify_mcp_tokens WHERE hash=${hash(String(p.token || ""))}) AND client_id=${String(p.client_id || "")}`;
  await sql`UPDATE testify_mcp_jobs SET cancel_requested=true WHERE grant_id IN (SELECT id FROM testify_mcp_grants WHERE revoked_at IS NOT NULL) AND status IN ('queued','loading','running','waiting_retry')`;
}
