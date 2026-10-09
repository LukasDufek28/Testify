import type { ApiFetch } from "./api-client";
import { parseStrategy, type Strategy } from "./types";
import type { DevelopmentPortfolioSummary } from "./research";

export const GEMINI_MODEL = "gemini-3.8-flash";

export async function generateStrategy(idea: string, apiFetch: ApiFetch): Promise<{ strategy: Strategy; model: string }> {
  if (!idea.trim()) throw new Error("Describe the strategy you want Gemini to create.");
  const response = await apiFetch("/api/generate-strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea: idea.trim() }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; strategy?: unknown; model?: string };
  if (!response.ok) throw new Error(body.error || `Gemini request failed (HTTP ${response.status}).`);
  if (!body.strategy) throw new Error("Gemini did not return a strategy.");
  return { strategy: parseStrategy(JSON.stringify(body.strategy)), model: body.model || GEMINI_MODEL };
}

export async function reviseStrategy(apiFetch: ApiFetch, strategy: Strategy, results: unknown[], guidance: string, portfolio?: DevelopmentPortfolioSummary): Promise<{ strategy: Strategy; model: string }> {
  const response = await apiFetch("/api/generate-strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "revise", strategy, results, portfolio, idea: guidance.trim() }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; strategy?: unknown; model?: string };
  if (!response.ok) throw new Error(body.error || `Gemini request failed (HTTP ${response.status}).`);
  if (!body.strategy) throw new Error("Gemini did not return a strategy.");
  return { strategy: parseStrategy(JSON.stringify(body.strategy)), model: body.model || GEMINI_MODEL };
}

export type ConsultationMessage = { role: "user" | "assistant"; text: string };
export async function consultStrategy(apiFetch: ApiFetch, strategy: unknown, results: unknown[], idea: string, messages: ConsultationMessage[], portfolio?: DevelopmentPortfolioSummary): Promise<{ answer: string; model: string }> {
  const response = await apiFetch("/api/generate-strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ask", strategy, results, portfolio, idea, messages: messages.slice(-8).map(message => ({ ...message, text: message.text.slice(0, 4000) })) }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Gemini could not answer.");
  if (typeof body.answer !== "string" || !body.answer.trim()) throw new Error("Gemini returned an empty answer.");
  return body;
}
