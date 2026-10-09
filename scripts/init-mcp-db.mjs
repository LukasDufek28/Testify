import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "[SENSITIVE]") throw new Error("A database connection is required.");
const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(new URL("../mcp-schema.sql", import.meta.url), "utf8");
await sql.transaction(schema.split(";").map(s => s.trim()).filter(Boolean).map(s => sql.query(s)));
console.log("MCP schema ready. No candle history or trade logs have been uploaded.");
