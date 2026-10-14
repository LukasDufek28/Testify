import { neon } from "@neondatabase/serverless";
import { cleanup } from "../lib/mcp/maintenance.js";
if(!process.env.DATABASE_URL)throw new Error("A database connection is required.");
const sql=neon(process.env.DATABASE_URL);
await cleanup(sql);
console.log("Expired MCP checkpoints and credentials removed.");
