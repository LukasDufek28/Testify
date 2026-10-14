import { randomUUID } from "node:crypto";
import { AuthError } from "../auth.js";
import { hash } from "./oauth.js";
export async function idempotent(sql,userId,key,payload,action) {
  if (typeof key!=="string" || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new AuthError("An idempotency key of 8–128 letters, digits, underscores or hyphens is required.",400);
  const fingerprint=hash(JSON.stringify(payload));
  const claimed=await sql`INSERT INTO testify_mcp_mutations(user_id,key,fingerprint) VALUES (${userId},${key},${fingerprint}) ON CONFLICT DO NOTHING RETURNING key`;
  if (!claimed.length) {
    const [existing]=await sql`SELECT fingerprint,response FROM testify_mcp_mutations WHERE user_id=${userId} AND key=${key}`;
    if (existing.fingerprint!==fingerprint) throw new AuthError("Idempotency key was used for another action.",409);
    if (!existing.response) throw new AuthError("This action is pending. Check its job or refresh before retrying.",409);
    return existing.response;
  }
  try {
    const response=await action();
    await sql`UPDATE testify_mcp_mutations SET response=${JSON.stringify(response)}::jsonb WHERE user_id=${userId} AND key=${key}`;
    return response;
  } catch(error) {
    // Keep uncertain failures claimed, so a lost response can never duplicate a committed action.
    if (error instanceof AuthError && error.status<500) await sql`DELETE FROM testify_mcp_mutations WHERE user_id=${userId} AND key=${key} AND response IS NULL`;
    throw error;
  }
}
export async function event(sql,identity,action,detail={}) {
  await sql`INSERT INTO testify_mcp_events(id,user_id,grant_id,action,detail) VALUES (${randomUUID()},${identity.userId},${identity.grantId || null},${action},${JSON.stringify(detail)}::jsonb)`;
}
export async function listRunSummaries(sql,userId,{name="",limit=100,offset=0}={}) {
  return (await sql`SELECT payload FROM testify_run_summaries WHERE user_id=${userId} AND position(lower(${name}) in lower(payload->>'name'))>0 ORDER BY (payload->>'createdAt')::bigint DESC LIMIT ${limit} OFFSET ${offset}`).map(r=>r.payload);
}
export async function getRunSummary(sql,userId,id) {
  const [row]=await sql`SELECT payload FROM testify_run_summaries WHERE user_id=${userId} AND id=${id}`;
  if (!row) throw new AuthError("Run summary not found.",404); return row.payload;
}
export async function requestApproval(sql,identity,action,targetId) {
  if (!["delete_run","delete_strategy","holdout"].includes(action)) throw new AuthError("Unsupported sensitive action.",400);
  const id=randomUUID();
  await sql`INSERT INTO testify_mcp_approvals(id,user_id,grant_id,action,target_id,expires_at) VALUES (${id},${identity.userId},${identity.grantId},${action},${targetId},now()+interval '30 minutes')`;
  return {approvalId:id,status:"awaiting_user",instructions:"Approve this exact action in Testify Connections, then retry with approvalId."};
}
export async function consumeApproval(sql,identity,id,action,targetId) {
  if(typeof id!=="string"||!/^[a-f0-9-]{36}$/.test(id))throw new AuthError("Explicit approval in Testify Connections is required.",403);
  const rows=await sql`UPDATE testify_mcp_approvals SET consumed_at=now() WHERE id=${id} AND user_id=${identity.userId} AND grant_id=${identity.grantId} AND action=${action} AND target_id=${targetId} AND approved_at IS NOT NULL AND consumed_at IS NULL AND expires_at>now() RETURNING id`;
  if (!rows.length) throw new AuthError("Explicit approval in Testify Connections is required.",403);
}
