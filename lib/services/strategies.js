import { AuthError } from "../auth.js";
import { parseStrategy } from "../shared/types.js";
import { validateGeneratedStrategy } from "../server-execution.js";
export const savedStrategy = row => ({ id:row.id,name:row.name,source:row.source,revision:row.revision,updatedAt:new Date(row.updated_at).getTime() });
export async function listStrategies(sql,userId) { return (await sql`SELECT id,name,source,revision,updated_at FROM testify_strategies WHERE user_id=${userId} ORDER BY updated_at DESC`).map(savedStrategy); }
export async function getStrategy(sql,userId,id,revision) {
 const rows = revision === undefined ? await sql`SELECT id,name,source,revision,updated_at FROM testify_strategies WHERE user_id=${userId} AND id=${id}` : await sql`SELECT v.strategy_id AS id,s.name,v.source,v.revision,v.created_at AS updated_at FROM testify_strategy_versions v JOIN testify_strategies s ON s.user_id=v.user_id AND s.id=v.strategy_id WHERE v.user_id=${userId} AND v.strategy_id=${id} AND v.revision=${revision}`;
 if (!rows[0]) throw new AuthError("Strategy not found.",404); return savedStrategy(rows[0]);
}
export async function saveStrategy(sql,userId,body) {
 if (!/^[A-Za-z0-9_-]{1,128}$/.test(body.id || "")) throw new AuthError("Invalid strategy ID.",400);
 const revision=body.expectedRevision;
 if (!Number.isInteger(revision)||revision<0) throw new AuthError("Expected revision is required.",400);
      if (typeof body.source !== "string" || body.source.length > 100000) throw new AuthError("Invalid strategy JSON.", 400);
      let parsed;
      try { parsed = parseStrategy(body.source); await validateGeneratedStrategy(parsed); } catch (error) { throw new AuthError(error.message, 400); }
      const source = JSON.stringify(parsed, null, 2);
      const rows = await sql`WITH changed AS (
        INSERT INTO testify_strategies (user_id, id, name, source, revision)
        SELECT ${userId}, ${body.id}, ${parsed.name}, ${source}, 1 WHERE ${revision} = 0
        ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, source = EXCLUDED.source, revision = testify_strategies.revision + 1, updated_at = now()
        WHERE testify_strategies.revision = ${revision}
        RETURNING id, name, source, revision, updated_at, user_id
      ), updated AS (
        UPDATE testify_strategies SET name = ${parsed.name}, source = ${source}, revision = revision + 1, updated_at = now()
        WHERE user_id = ${userId} AND id = ${body.id} AND revision = ${revision} AND ${revision} > 0
        RETURNING id, name, source, revision, updated_at, user_id
      ), revisions AS (
        INSERT INTO testify_strategy_versions (user_id, strategy_id, revision, source)
        SELECT user_id, id, revision, source FROM changed UNION ALL SELECT user_id, id, revision, source FROM updated
      ) SELECT * FROM changed UNION ALL SELECT * FROM updated`;
      if (!rows.length) throw new AuthError("This strategy changed or was deleted elsewhere. Reload the library before saving; your draft is still in the editor.", 409);

return savedStrategy(rows[0]);
}

