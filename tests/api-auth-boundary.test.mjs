import { test } from "node:test";
import assert from "node:assert/strict";
import strategies from "../api/strategies.js";
import markets from "../api/markets.js";
import candles from "../api/candles.js";
import backtest from "../api/backtest.js";
import generate from "../api/generate-strategy.js";

test("every research endpoint rejects unauthenticated requests before calling providers", async () => {
  process.env.AUTH_SECRET = "test-secret-long-enough-for-auth-configuration";
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  process.env.APP_ORIGINS = "https://testify.example";
  const old = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unauthenticated request reached an upstream service"); };
  try {
    for (const [handler, method] of [[strategies, "GET"], [markets, "GET"], [candles, "GET"], [backtest, "POST"], [generate, "POST"]]) {
      const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(body) { this.body = body; return this; } };
      await handler({ method, headers: { origin: "https://testify.example", host: "testify.example" }, query: {}, body: {} }, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.headers["Cache-Control"], "private, no-store");
    }
  } finally { globalThis.fetch = old; delete process.env.AUTH_SECRET; delete process.env.DATABASE_URL; delete process.env.APP_ORIGINS; }
});
