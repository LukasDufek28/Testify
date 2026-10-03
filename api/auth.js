import { randomUUID } from "node:crypto";
import { database, checkOrigin, credentials, hashPassword, verifyPassword, newSession, session, revokeSession, setCookie, limit, AuthError, authFailure } from "../lib/auth.js";

export function createAuthHandler(connect = database) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });
      if (req.method === "POST") checkOrigin(req);
      const sql = connect();
      if (req.method === "GET") {
        const user = await session(req, sql);
        return res.status(200).json({ user: user ? { id: user.id, email: user.email, sessionId: user.session_id } : null });
      }
      if (Number(req.headers["content-length"] || 0) > 2048) throw new AuthError("Request is too large.", 413);
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (body?.action === "logout") {
        const current = await session(req, sql);
        if (current && req.headers["x-testify-session"] && req.headers["x-testify-session"] !== current.session_id) throw new AuthError("Your session changed. Refresh before signing out.");
        await revokeSession(req, sql); setCookie(res, "", 0); return res.status(200).json({ user: null });
      }
      if (!["login", "register"].includes(body?.action)) throw new AuthError("Invalid account action.", 400);
      const { email, password } = credentials(body);
      const ip = process.env.VERCEL ? String(req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown") : String(req.socket?.remoteAddress || "local");
      await limit(sql, "account-ip", ip, 20);
      await limit(sql, "account-email", email, 8);
      let account;
      if (body.action === "register") {
        const hash = await hashPassword(password);
        const rows = await sql`INSERT INTO testify_accounts (id, email, password_hash) VALUES (${randomUUID()}, ${email}, ${hash}) ON CONFLICT (email) DO NOTHING RETURNING id, email`;
        account = rows[0];
        if (!account) throw new AuthError("Unable to create this account. Try signing in instead.", 400);
      } else {
        const rows = await sql`SELECT id, email, password_hash FROM testify_accounts WHERE email = ${email}`;
        account = rows[0];
        // Derive even for unknown accounts so the response doesn't shortcut password checking.
        const encoded = account?.password_hash || `scrypt$00000000000000000000000000000000$${"0".repeat(128)}`;
        const valid = await verifyPassword(password, encoded);
        if (!account || !valid) throw new AuthError("Email or password is incorrect.");
      }
      await revokeSession(req, sql);
      await sql`DELETE FROM testify_sessions WHERE expires_at < now()`;
      await sql`DELETE FROM testify_auth_limits WHERE bucket < ${Math.floor(Date.now() / 60000) - 1440}`;
      const created = await newSession(sql, account.id);
      setCookie(res, created.token);
      return res.status(200).json({ user: { id: account.id, email: account.email, sessionId: created.id } });
    } catch (error) { if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON." }); return authFailure(res, error); }
  };
}
export default createAuthHandler();
