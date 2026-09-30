import { runBacktest } from "./engine";
import type { BacktestSettings, Dataset, Strategy } from "./types";
self.onmessage = (event: MessageEvent<{ dataset: Dataset; strategy: Strategy; settings: BacktestSettings; strategyId: string; name: string }>) => {
  try { self.postMessage({ ok: true, run: runBacktest(event.data.dataset, event.data.strategy, event.data.settings, event.data.strategyId, event.data.name) }); }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
