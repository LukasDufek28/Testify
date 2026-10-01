import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/generate-strategy.js";

function reply() {
  return { statusCode: 200, headers: {}, body: null, setHeader(key, value) { this.headers[key] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}
function request(idea = "Create a simple moving average crossover") {
  return { method: "POST", headers: { host: "testify.example", origin: "https://testify.example", "x-forwarded-for": crypto.randomUUID() }, body: { idea } };
}

test("the shared key is required and is never requested from the visitor", async () => {
  const old = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try { const res = reply(); await handler(request(), res); assert.equal(res.statusCode, 503); assert.match(res.body.error, /site owner/); }
  finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});

test("the function fixes the model, validates output, and does not return the key", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-secret";
  const strategy = { version: 1, name: "SMA crossover", description: "Test", side: "long", entryLong: [{ left: { kind: "sma", period: 5 }, op: "crosses_above", right: { kind: "sma", period: 10 } }], entryShort: [], exitLong: [], exitShort: [], stopLossPct: 1, takeProfitPct: 2, allocationPct: 50 };
  globalThis.fetch = async (url, options) => {
    assert.match(url, /models\/gemini-3\.8-flash:generateContent$/);
    assert.equal(options.headers["x-goog-api-key"], "test-secret");
    assert.doesNotMatch(options.body, /test-secret/);
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.generationConfig.responseMimeType, "application/json");
    assert.equal(requestBody.generationConfig.responseJsonSchema, undefined);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(strategy) }] } }] }) };
  };
  try { const res = reply(); await handler(request(), res); assert.equal(res.statusCode, 200); assert.deepEqual(res.body.strategy, strategy); assert.doesNotMatch(JSON.stringify(res.body), /test-secret/); }
  finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; }
});

test("falls back to 3.7 Flash when 3.8 Flash is busy", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-secret";
  const seen = [];
  const strategy = { version: 1, name: "Trend", description: "Test", side: "long", entryLong: [{ left: { kind: "close" }, op: "gt", right: { kind: "sma", period: 20 } }], entryShort: [], exitLong: [], exitShort: [], stopLossPct: 1, takeProfitPct: 2, allocationPct: 50 };
  globalThis.fetch = async (url) => {
    seen.push(url);
    if (seen.length === 1) return { ok: false, status: 503, json: async () => ({ error: { status: "UNAVAILABLE", message: "busy" } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(strategy) }] } }] }) };
  };
  try { const res = reply(); await handler(request(), res); assert.equal(res.statusCode, 200); assert.equal(res.body.model, "gemini-3.7-flash"); assert.match(seen[0], /gemini-3\.8-flash/); assert.match(seen[1], /gemini-3\.7-flash/); }
  finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; }
});

test("falls back when a model fails or returns an invalid strategy", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-secret";
  const seen = [];
  const strategy = { version: 2, name: "Mean reversion", description: "Buys below a moving average", side: "long", indicators: [], entryLong: [{ left: { kind: "close" }, op: "lt", right: { kind: "sma", period: 20 } }], entryShort: [], exitLong: [{ left: { kind: "close" }, op: "gt", right: { kind: "sma", period: 20 } }], exitShort: [], stopLossPct: 2, takeProfitPct: 3, allocationPct: 50 };
  globalThis.fetch = async (url) => {
    seen.push(url);
    if (seen.length === 1) return { ok: false, status: 502, json: async () => ({ error: { status: "BAD_GATEWAY", message: "temporary" } }) };
    if (seen.length < 4) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...strategy, entryLong: [] }) }] } }] }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(strategy) }] } }] }) };
  };
  try { const res = reply(); await handler(request("make me a mean reversion strategy"), res); assert.equal(res.statusCode, 200); assert.deepEqual(res.body.strategy, strategy); assert.equal(res.body.model, "gemini-3.6-flash"); }
  finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; }
});

test("Gemini can return a validated custom indicator strategy", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-secret";
  const strategy = { version: 2, name: "Custom momentum", description: "Uses a one-bar change", side: "long", indicators: [{ name: "Momentum", formula: { op: "subtract", left: { op: "source", field: "close" }, right: { op: "lag", input: { op: "source", field: "close" }, period: 1 } } }], entryLong: [{ left: { kind: "custom", name: "Momentum" }, op: "gt", right: 0 }], entryShort: [], exitLong: [{ left: { kind: "custom", name: "Momentum" }, op: "lt", right: 0 }], exitShort: [], stopLossPct: 1, takeProfitPct: 2, allocationPct: 50 };
  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(options.body).contents[0].parts[0].text;
    assert.match(prompt, /original named indicators/);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(strategy) }] } }] }) };
  };
  try { const res = reply(); await handler(request("Create a custom momentum indicator"), res); assert.equal(res.statusCode, 200); assert.deepEqual(res.body.strategy, strategy); }
  finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; }
});

test("Gemini revision receives the selected strategy and development summaries", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-secret";
  const strategy = { version: 2, name: "Mean reversion", description: "Revised fees", side: "long", indicators: [], entryLong: [{ left: { kind: "close" }, op: "lt", right: { kind: "sma", period: 20 } }], entryShort: [], exitLong: [], exitShort: [], stopLossPct: 2, takeProfitPct: 3, allocationPct: 50 };
  const result = { phase: "development", name: "Research run", symbol: "BTC-USD", netReturnPct: -2, tradeCount: 100, totalFees: 50 };
  let prompt = "";
  globalThis.fetch = async (_url, options) => { prompt = JSON.parse(options.body).contents[0].parts[0].text; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(strategy) }] } }] }) }; };
  try {
    const req = request(""); req.body = { mode: "revise", idea: "Reduce overtrading", strategy, results: [result] };
    const res = reply(); await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(prompt, /Reduce overtrading/);
    assert.match(prompt, /Mean reversion/);
    assert.match(prompt, /totalFees/);
    assert.match(prompt, /reserved holdout/);
    const invalid = reply(); req.headers["x-forwarded-for"] = crypto.randomUUID(); req.body.results = [{ ...result, phase: "validation" }]; await handler(req, invalid);
    assert.equal(invalid.statusCode, 400);
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; }
});
