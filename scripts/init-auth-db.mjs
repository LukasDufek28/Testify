import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "[SENSITIVE]") throw new Error("A database connection is required.");
const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(new URL("../auth-schema.sql", import.meta.url), "utf8");
const statements = schema.replace(/^\s*--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
await sql.transaction(statements.map((statement) => sql.query(statement)));
const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('testify_accounts', 'testify_sessions', 'testify_auth_limits') ORDER BY table_name`;
if (tables.length !== 3) throw new Error("Account schema could not be verified.");
console.log("Account database connected; all three account tables are ready.");
