import type { ApiFetch } from "./api-client";
import type { SavedStrategy } from "./types";
export class StrategyStoreError extends Error { constructor(message: string, public status: number) { super(message); } }
export function createStrategyStore(apiFetch: ApiFetch) {
  async function request(method: string, body?: unknown) {
    const response = await apiFetch("/api/strategies", { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new StrategyStoreError(result.error || "Could not access your saved strategies.", response.status);
    return result;
  }
  return {
    strategies: async (): Promise<SavedStrategy[]> => (await request("GET")).strategies,
    putStrategy: async (strategy: SavedStrategy): Promise<SavedStrategy> => (await request("PUT", { id: strategy.id, source: strategy.source, expectedRevision: strategy.revision ?? 0 })).strategy,
    deleteStrategy: async (strategy: SavedStrategy) => request("DELETE", { id: strategy.id, expectedRevision: strategy.revision }),
  };
}
