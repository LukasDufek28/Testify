const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
const MAX_IDEA_LENGTH = 1200;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const attempts = new Map();

const indicatorSchema = { type: "object", properties: { kind: { type: "string", enum: ["close", "open", "high", "low", "sma", "ema", "rsi"] }, period: { type: "integer" } }, required: ["kind"] };
const ruleSchema = { type: "object", properties: { left: indicatorSchema, op: { type: "string", enum: ["gt", "lt", "crosses_above", "crosses_below"] }, right: { anyOf: [indicatorSchema, { type: "number" }] } }, required: ["left", "op", "right"] };
const schema = { type: "object", properties: { version: { type: "integer" }, name: { type: "string" }, description: { type: "string" }, side: { type: "string", enum: ["long", "short", "both"] }, entryLong: { type: "array", items: ruleSchema }, entryShort: { type: "array", items: ruleSchema }, exitLong: { type: "array", items: ruleSchema }, exitShort: { type: "array", items: ruleSchema }, stopLossPct: { type: "number" }, takeProfitPct: { type: "number" }, allocationPct: { type: "number" } }, required: ["version", "name", "description", "side", "entryLong", "entryShort", "exitLong", "exitShort", "stopLossPct", "takeProfitPct", "allocationPct"] };
const instructions = `Return exactly one JSON strategy object for Testify. Do not return JavaScript, Rust, Markdown, or explanations outside JSON. Required fields: version=1, name, description, side (long, short, both), entryLong, entryShort, exitLong, exitShort, stopLossPct, takeProfitPct, allocationPct. A rule has left indicator, op, right indicator or number. Indicator kinds: close/open/high/low (no period), sma/ema/rsi (integer period 2-500). Operators: gt, lt, crosses_above, crosses_below. All rules in an array are combined with AND. Signals use completed bars only and fill at the next bar open. Include a meaningful exit rule and modest risk settings. Never claim that a strategy will be profitable. Do not reference future data or unsupported fields.`;

function validIndicator(value) {
  return value && typeof value === "object" && ["close", "open", "high", "low", "sma", "ema", "rsi"].includes(value.kind) && (!["sma", "ema", "rsi"].includes(value.kind) || (Number.isInteger(value.period) && value.period >= 2 && value.period <= 500));
}
function validRules(value) {
  return Array.isArray(value) && value.length <= 12 && value.every((rule) => rule && validIndicator(rule.left) && ["gt", "lt", "crosses_above", "crosses_below"].includes(rule.op) && (validIndicator(rule.right) || (typeof rule.right === "number" && Number.isFinite(rule.right))));
}
function validStrategy(value) {
  return value && value.version === 1 && typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 100 && typeof value.description === "string" && ["long", "short", "both"].includes(value.side) && [value.entryLong, value.entryShort, value.exitLong, value.exitShort].every(validRules) && [value.stopLossPct, value.takeProfitPct, value.allocationPct].every((v) => typeof v === "number" && Number.isFinite(v)) && value.stopLossPct >= 0 && value.stopLossPct <= 100 && value.takeProfitPct >= 0 && value.takeProfitPct <= 100 && value.allocationPct > 0 && value.allocationPct <= 100 && (value.side === "short" || value.entryLong.length > 0) && (value.side === "long" || value.entryShort.length > 0);
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "Use POST." });
  const origin = request.headers.origin;
  if (origin) {
    let sameOrigin = false;
    try { sameOrigin = new URL(origin).host === request.headers.host; } catch { /* invalid origin */ }
    if (!sameOrigin) return response.status(403).json({ error: "Requests must come from Testify." });
  }
  const rawLength = Number(request.headers["content-length"] || 0);
  if (rawLength > 5000) return response.status(413).json({ error: "Strategy description is too long." });
  let body = request.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return response.status(400).json({ error: "Invalid JSON." }); } }
  const idea = body?.idea;
  if (typeof idea !== "string" || !idea.trim() || idea.length > MAX_IDEA_LENGTH) return response.status(400).json({ error: "Enter a strategy description up to 1,200 characters." });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: "Gemini is not configured yet. The site owner must add GEMINI_API_KEY in Vercel." });

  // Best-effort limit for warm instances. The Google project's quota remains the spend ceiling.
  const ip = String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return response.status(429).json({ error: "Please wait a minute before generating another strategy." });
  recent.push(now); attempts.set(ip, recent);
  if (attempts.size > 2000) for (const [key, times] of attempts) if (times.every((time) => now - time >= WINDOW_MS)) attempts.delete(key);

  for (const model of MODELS) {
    try {
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${instructions}\n\nStrategy request:\n${idea.trim()}` }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, thinkingConfig: { thinkingLevel: "low" }, maxOutputTokens: 2000 } }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const detail = String(result.error?.message || "").replaceAll(apiKey, "[redacted]").slice(0, 500);
        console.warn("Gemini upstream error", model, upstream.status, result.error?.status || "unknown", detail);
        if (upstream.status === 503) continue;
        return response.status(upstream.status === 429 ? 429 : 502).json({ error: upstream.status === 429 ? "Gemini quota reached. Please try again later." : "Gemini could not generate a strategy right now." });
      }
      const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
      if (!text) return response.status(502).json({ error: "Gemini returned an empty strategy." });
      let strategy;
      try { strategy = JSON.parse(text); } catch { return response.status(502).json({ error: "Gemini returned invalid JSON. Try again." }); }
      if (!validStrategy(strategy)) return response.status(502).json({ error: "Gemini returned unsupported strategy rules. Try a simpler request." });
      return response.status(200).json({ strategy, model });
    } catch {
      console.warn("Gemini connection failed", model);
    }
  }
  return response.status(503).json({ error: "Gemini is temporarily busy. Please try again shortly." });
}
