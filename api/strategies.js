import { database, requireUser, AuthError, authFailure } from "../lib/auth.js";
import { parseStrategy } from "../lib/shared/types.js";
import { validateGeneratedStrategy } from "../lib/server-execution.js";
const saved = (row) => ({ id: row.id, name: row.name, source: row.source, revision: row.revision, updatedAt: new Date(row.updated_at).getTime() });
export function createStrategiesHandler(connect = database, authorize = requireUser) {
  return async (req, res) => {
    if (!["GET", "PUT", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });
    const user = await authorize(req, res, "strategies", 120);
    if (!user) return;
    try {
      const sql = connect();
      if (req.method === "GET") {
        if (req.query?.versions === "1") {
          const rows = await sql`SELECT revision, source, created_at FROM testify_strategy_versions WHERE user_id = ${user.id} AND strategy_id = ${String(req.query.id || "")} ORDER BY revision DESC`;
          return res.status(200).json({ versions: rows.map((row) => ({ revision: row.revision, source: row.source, createdAt: new Date(row.created_at).getTime() })) });
        }
        const rows = await sql`SELECT id, name, source, revision, updated_at FROM testify_strategies WHERE user_id = ${user.id} ORDER BY updated_at DESC`;
        return res.status(200).json({ strategies: rows.map(saved) });
      }
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { throw new AuthError("Invalid JSON.", 400); } }
      if (!body || JSON.stringify(body).length > 110000) throw new AuthError("Strategy request is too large.", 413);
      if (typeof body.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.id)) throw new AuthError("Invalid strategy ID.", 400);
      const revision = body.expectedRevision;
      if (!Number.isInteger(revision) || revision < 0) throw new AuthError("The saved strategy revision is required.", 400);
      if (req.method === "DELETE") {
        const rows = await sql`DELETE FROM testify_strategies WHERE user_id = ${user.id} AND id = ${body.id} AND revision = ${revision} RETURNING id`;
        if (!rows.length) throw new AuthError("This strategy changed or was deleted elsewhere. Reload the library and try again.", 409);
        return res.status(200).json({ deleted: body.id });
      }
      if (typeof body.source !== "string" || body.source.length > 100000) throw new AuthError("Invalid strategy JSON.", 400);
      let parsed;
      try { parsed = parseStrategy(body.source); await validateGeneratedStrategy(parsed); } catch (error) { throw new AuthError(error.message, 400); }
      const source = JSON.stringify(parsed, null, 2);
      const rows = await sql`WITH changed AS (
        INSERT INTO testify_strategies (user_id, id, name, source, revision)
        SELECT ${user.id}, ${body.id}, ${parsed.name}, ${source}, 1 WHERE ${revision} = 0
        ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, source = EXCLUDED.source, revision = testify_strategies.revision + 1, updated_at = now()
        WHERE testify_strategies.revision = ${revision}
        RETURNING id, name, source, revision, updated_at, user_id
      ), updated AS (
        UPDATE testify_strategies SET name = ${parsed.name}, source = ${source}, revision = revision + 1, updated_at = now()
        WHERE user_id = ${user.id} AND id = ${body.id} AND revision = ${revision} AND ${revision} > 0
        RETURNING id, name, source, revision, updated_at, user_id
      ), revisions AS (
        INSERT INTO testify_strategy_versions (user_id, strategy_id, revision, source)
        SELECT user_id, id, revision, source FROM changed UNION ALL SELECT user_id, id, revision, source FROM updated
      ) SELECT * FROM changed UNION ALL SELECT * FROM updated`;
      if (!rows.length) throw new AuthError("This strategy changed or was deleted elsewhere. Reload the library before saving; your draft is still in the editor.", 409);
      return res.status(200).json({ strategy: saved(rows[0]) });
    } catch (error) { return authFailure(res, error); }
  };
}
export default createStrategiesHandler();
