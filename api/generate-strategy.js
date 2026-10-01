import { parseStrategy } from "../lib/shared/types.js";

const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
const MAX_IDEA_LENGTH = 3000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const attempts = new Map();

const instructions = `Create one executable Testify strategy as JSON only. Use version 2. Honor the user's requested logic and parameters where the format supports them; do not silently substitute a different indicator. The top-level fields are version, name, description, side (long/short/both), indicators, entryLong, entryShort, exitLong, exitShort, stopLossPct, takeProfitPct, allocationPct.
You may define up to 16 original named indicators in indicators: [{"name":"Momentum","formula":{...}}]. Names use letters, digits and underscores, start with a letter, and are unique. Formulas are expression trees with an op:
- source: {"op":"source","field":"close"}; fields open/high/low/close/volume.
- constant: {"op":"constant","value":2}; ref: {"op":"ref","name":"Momentum"} to use another named indicator.
- binary add/subtract/multiply/divide/min/max require both left and right formula objects. Example: {"op":"subtract","left":{"op":"source","field":"close"},"right":{"op":"lag","input":{"op":"source","field":"close"},"period":1}}.
- unary abs/negate/cumsum require an input formula object. Example: {"op":"abs","input":{"op":"source","field":"close"}}.
- rolling lag/sma/ema/rsi/highest/lowest/stdev require an input formula object and period. Example: {"op":"ema","input":{"op":"source","field":"volume"},"period":20}. Period is 2-500 except lag is 1-500.
- atr: {"op":"atr","period":14}. ATR is the moving average of true range.
You can build MACD, Bollinger bands, volume-weighted formulas, momentum, and other original indicators by composing these operations. Keep formulas acyclic and use current or past bars only. Never use code, scripts, future bars, or fields outside this grammar.
Rules compare built-in indicators or custom indicators with gt/lt/crosses_above/crosses_below. Built-ins: close/open/high/low/volume; sma/ema/rsi/atr with period 2-500. A custom operand is {"kind":"custom","name":"Momentum"}. A rule is {"left":{...},"op":"gt","right":{...}}; right can also be a number. A flat rule array means AND. An array of rule arrays means OR between groups, AND within each group. Use at most 8 OR groups and 12 rules per group. For example entryLong:[[ruleA,ruleB],[ruleC]] means (A AND B) OR C. Empty exit arrays are allowed, but define meaningful exits where possible. Include long and short entry rules for side=both.
Signals use completed bars and orders fill at the next bar open. Stops and targets are percentages; allocationPct is 0-100. Use the requested risk settings or conservative defaults. Describe what the strategy really does. Never promise profit or invent unsupported features. If an idea requires unavailable data or execution behavior, adapt only the unsupported part and state the limitation in description.`;

async function generate(model, apiKey, prompt) {
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" }, maxOutputTokens: 6000 } }),
    signal: AbortSignal.timeout(45_000),
  });
  const result = await upstream.json().catch(() => ({}));
  return { upstream, result, text: result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") };
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
  if (rawLength > 9000) return response.status(413).json({ error: "Strategy description is too long." });
  let body = request.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return response.status(400).json({ error: "Invalid JSON." }); } }
  const idea = body?.idea;
  if (typeof idea !== "string" || !idea.trim() || idea.length > MAX_IDEA_LENGTH) return response.status(400).json({ error: "Enter a strategy description up to 3,000 characters." });
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
      const prompt = `${instructions}\n\nStrategy request:\n${idea.trim()}`;
      const { upstream, result, text } = await generate(model, apiKey, prompt);
      if (!upstream.ok) {
        const detail = String(result.error?.message || "").replaceAll(apiKey, "[redacted]").slice(0, 500);
        console.warn("Gemini upstream error", model, upstream.status, result.error?.status || "unknown", detail);
        if (upstream.status === 503) continue;
        return response.status(upstream.status === 429 ? 429 : 502).json({ error: upstream.status === 429 ? "Gemini quota reached. Please try again later." : "Gemini could not generate a strategy right now." });
      }
      if (!text) return response.status(502).json({ error: "Gemini returned an empty strategy." });
      let strategy;
      try { strategy = JSON.parse(text); } catch { return response.status(502).json({ error: "Gemini returned invalid JSON. Try again." }); }
      try { strategy = parseStrategy(JSON.stringify(strategy)); } catch (error) {
        const repair = await generate(model, apiKey, `${prompt}\n\nYour previous JSON was rejected: ${error.message}\nCorrect every invalid formula and rule. Each formula operation must include its required fields exactly as specified above. Return the complete corrected strategy JSON. Previous JSON:\n${text.slice(0, 20000)}`);
        if (!repair.upstream.ok || !repair.text) return response.status(502).json({ error: `Gemini returned a strategy Testify cannot run: ${error.message}` });
        try { strategy = parseStrategy(repair.text); } catch (repairError) { return response.status(502).json({ error: `Gemini returned a strategy Testify cannot run: ${repairError.message}` }); }
      }
      return response.status(200).json({ strategy, model });
    } catch {
      console.warn("Gemini connection failed", model);
    }
  }
  return response.status(503).json({ error: "Gemini is temporarily busy. Please try again shortly." });
}
