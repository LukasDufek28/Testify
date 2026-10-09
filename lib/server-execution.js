import { Worker } from "node:worker_threads";
import { runBacktest } from "./shared/engine.js";

function execute(payload, timeout, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./strategy-worker.js", import.meta.url), { workerData: payload, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    const abort = () => { cleanup(); reject(new Error("Backtest cancelled.")); };
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error("Custom strategy exceeded its execution time budget.")); }, timeout);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); void worker.terminate(); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    worker.once("message", (result) => { cleanup(); result.ok ? resolve(result.run) : reject(new Error(result.error)); });
    worker.once("error", (error) => { cleanup(); reject(error); });
    worker.once("exit", (code) => { clearTimeout(timer); if (code !== 0) reject(new Error("Custom strategy worker stopped.")); });
  });
}
export async function validateGeneratedStrategy(strategy) {
  if (strategy.version === 3) await execute({ action: "validate", strategy }, 10000);
}
export async function runServerBacktest(dataset, strategy, settings, strategyId, name, signal) {
  if (strategy.version !== 3 && !signal) return runBacktest(dataset, strategy, settings, strategyId, name);
  return execute({ dataset, strategy, settings, strategyId, name }, 130000, signal);
}
