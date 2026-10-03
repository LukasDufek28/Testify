import { parseStrategy, type Run, type SavedStrategy, type Strategy } from "./types";

export function parseStrategyImport(text: string): Strategy[] {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("Invalid JSON. Check commas, quotes and brackets, then import again."); }
  const items = Array.isArray(raw) ? raw : [raw];
  if (!items.length) throw new Error("The file contains no strategies.");
  if (items.length > 100) throw new Error("Import up to 100 strategies at a time.");
  // Validate the entire file before any strategy is saved.
  return items.map((item, index) => {
    try {
      const source = item && typeof item === "object" && "source" in item ? item.source : undefined;
      return parseStrategy(typeof source === "string" ? source : JSON.stringify(item));
    } catch (error) {
      throw new Error(`Strategy ${index + 1}: ${error instanceof Error ? error.message : "Invalid strategy."} Nothing was imported.`);
    }
  });
}

export function duplicateStrategyName(name: string, strategies: SavedStrategy[]): string {
  const names = new Set(strategies.map(strategy => strategy.name.toLowerCase()));
  for (let index = 1; ; index++) {
    const suffix = index === 1 ? " copy" : ` copy ${index}`;
    const candidate = name.slice(0, 100 - suffix.length).trimEnd() + suffix;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

export function latestStrategyRuns(runs: Run[]): Map<string, Run> {
  const latest = new Map<string, Run>();
  for (const run of runs) {
    if (!latest.has(run.strategyId) || run.createdAt > latest.get(run.strategyId)!.createdAt) latest.set(run.strategyId, run);
  }
  return latest;
}
