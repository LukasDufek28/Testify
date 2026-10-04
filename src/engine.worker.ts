import { runStrategyBacktest, validateScriptStrategy } from "./programmable-engine";
import type { BacktestSettings, Dataset, Strategy } from "./types";
self.onmessage = async (event: MessageEvent<{ action?: "validate"; dataset: Dataset; strategy: Strategy; settings: BacktestSettings; strategyId: string; name: string }>) => {
  try {
    if (event.data.action === "validate") { await validateScriptStrategy(event.data.strategy); self.postMessage({ ok: true }); }
    else self.postMessage({ ok: true, run: await runStrategyBacktest(event.data.dataset, event.data.strategy, event.data.settings, event.data.strategyId, event.data.name) });
  }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
