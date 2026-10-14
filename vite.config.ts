import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Run the same server-only handlers locally that Vercel runs in deployment.
function localApi(): Plugin {
  return {
    name: "testify-local-api",
    configureServer(server) {
      const routes = new Set([
        "markets",
        "candles",
        "generate-strategy",
        "backtest", "auth", "connections", "research-cloud", "slippage", "strategies",
      ]);
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        const route = url.pathname.replace(/^\/api\//, "");
        if (!url.pathname.startsWith("/api/") || !routes.has(route))
          return next();
        const response = {
          setHeader: (key: string, value: string | number | string[]) =>
            res.setHeader(key, value),
          status(code: number) {
            res.statusCode = code;
            return response;
          },
          json(value: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(value));
            return response;
          },
        };
        try {
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of req) {
            const data = Buffer.from(chunk);
            chunks.push(data);
            bytes += data.length;
            if (bytes > 90000)
              return response
                .status(413)
                .json({ error: "Request is too large." });
          }
          const body = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = body ? JSON.parse(body) : undefined;
          } catch {
            return response.status(400).json({ error: "Invalid JSON body." });
          }
          const { default: handler } = await server.ssrLoadModule(
            resolve(`api/${route}.js`),
          );
          await handler(
            {
              method: req.method,
              headers: req.headers,
              socket: req.socket,
              query: Object.fromEntries(url.searchParams),
              body: parsed,
            },
            response,
          );
        } catch (error) {
          server.config.logger.error(String(error));
          if (!res.writableEnded)
            response.status(500).json({ error: "Local API request failed." });
        }
      });
    },
  };
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY)
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  for (const [key, value] of Object.entries(env)) if (!key.startsWith("VITE_") && !process.env[key]) process.env[key] = value;
  return { server: { watch: { ignored: ["**/playwright-report/**", "**/test-results/**", "**/.playwright-cli/**", "**/.local/**"] } }, worker: {format:"es"}, plugins: [react(), localApi()], build: { target: "es2022" } };
});
