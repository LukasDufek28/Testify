import { database, requireUser, AuthError, authFailure } from "../lib/auth.js";
import { saveStrategy } from "../lib/services/strategies.js";
import { validateGeneratedStrategy } from "../lib/server-execution.js";
import {ensureWorkspaceSchema} from '../lib/workspace-records.js';
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
        if(req.query?.includeMetadata==='1'){
          await ensureWorkspaceSchema(sql);
          const recent=await sql`SELECT DISTINCT ON (payload->>'strategyId') payload->>'strategyId' AS strategy_id,payload->>'id' AS run_id,payload->>'symbol' AS market,payload->'granularity' AS timeframe,payload->'metrics' AS metrics FROM testify_workspace_records WHERE user_id=${user.id} AND kind='runs' ORDER BY payload->>'strategyId',(payload->>'createdAt')::bigint DESC`;
          return res.status(200).json({strategies:rows.map(row=>{const last=recent.find(r=>r.strategy_id===row.id);return {...saved(row),market:last?.market??null,timeframe:last?.timeframe??null,lastResult:last?{id:last.run_id,metrics:last.metrics}:null};})});
        }
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
      return res.status(200).json({ strategy: await saveStrategy(sql,user.id,body) });
    } catch (error) { return authFailure(res, error); }
  };
}
export default createStrategiesHandler();
