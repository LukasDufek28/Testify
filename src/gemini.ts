import { parseStrategy, type Strategy } from "./types";

export const GEMINI_MODEL = "gemini-3.8-flash";

export async function generateStrategy(idea: string): Promise<{ strategy: Strategy; model: string }> {
  if (!idea.trim()) throw new Error("Describe the strategy you want Gemini to create.");
  const response = await fetch("/api/generate-strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea: idea.trim().slice(0, 3000) }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; strategy?: unknown; model?: string };
  if (!response.ok) throw new Error(body.error || `Gemini request failed (HTTP ${response.status}).`);
  if (!body.strategy) throw new Error("Gemini did not return a strategy.");
  return { strategy: parseStrategy(JSON.stringify(body.strategy)), model: body.model || GEMINI_MODEL };
}

export async function reviseStrategy(strategy: Strategy, results: unknown[], guidance: string): Promise<{ strategy: Strategy; model: string }> {
  if (!results.length) throw new Error("Select at least one development backtest.");
  const response = await fetch("/api/generate-strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "revise", strategy, results, idea: guidance.trim().slice(0, 3000) }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; strategy?: unknown; model?: string };
  if (!response.ok) throw new Error(body.error || `Gemini request failed (HTTP ${response.status}).`);
  if (!body.strategy) throw new Error("Gemini did not return a strategy.");
  return { strategy: parseStrategy(JSON.stringify(body.strategy)), model: body.model || GEMINI_MODEL };
}
