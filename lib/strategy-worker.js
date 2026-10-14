import { parentPort, workerData } from "node:worker_threads";
import { runStrategyBacktest, validateScriptStrategy } from "./shared/programmable-engine.js";
try {
  if (workerData.action === "validate") { await validateScriptStrategy(workerData.strategy); parentPort.postMessage({ ok: true }); }
  else parentPort.postMessage({ ok: true, run: await runStrategyBacktest(workerData.dataset, workerData.strategy, workerData.settings, workerData.strategyId, workerData.name) });
} catch (error) { parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : "Strategy execution failed." }); }
