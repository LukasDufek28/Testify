import { timingSafeEqual } from "node:crypto";
import { database } from "../../../../../lib/auth.js";
import { cleanup } from "../../../../../lib/mcp/maintenance.js";
export const runtime="nodejs";
export async function GET(request:Request) {
  const expected=process.env.CRON_SECRET;
  const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"") || "";
  if(!expected||expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return Response.json({error:"Unauthorized"},{status:401});
  await cleanup(database());return Response.json({ok:true});
}
