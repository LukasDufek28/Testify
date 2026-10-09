import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
try{process.loadEnvFile(new URL("../.env.local",import.meta.url));}catch(error){if(error.code!=="ENOENT")throw error;}
process.env.MCP_PUBLIC_URL ||= "http://localhost:3001";
process.env.TESTIFY_SITE_URL ||= "http://127.0.0.1:5174";
process.chdir(`${root}/apps/mcp`);
process.argv=[process.argv[0],"next","dev","--port","3001","--hostname","127.0.0.1"];
await import("../apps/mcp/node_modules/next/dist/bin/next");
