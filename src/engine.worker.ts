import { runBacktest } from "./engine";
import { runStrategyBacktest, validateScriptStrategy } from "./programmable-engine";
import type { BacktestSettings, Dataset, Strategy } from "./types";
self.onmessage = async (event: MessageEvent<{ action?: "validate"; dataset: Dataset; strategy: Strategy; settings: BacktestSettings; strategyId: string; name: string }>) => {
  try {
    if (event.data.action === "validate") { await validateScriptStrategy(event.data.strategy); self.postMessage({ ok: true }); }
    else { const {dataset,strategy,settings,strategyId,name}=event.data; const run=strategy.version === 3 ? await runStrategyBacktest(dataset,strategy,settings,strategyId,name) : runBacktest(dataset,strategy,settings,strategyId,name,fraction => self.postMessage({progress:fraction})); self.postMessage({ok:true,run}); }
  }

  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
