import { runBacktest } from "../lib/shared/engine.js";
import { parseStrategy } from "../lib/shared/types.js";
import { getCandles } from "../lib/crypto-data.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const body = req.body || {};
    const product = String(body.product || "");
    const granularity = Number(body.granularity);
    const strategy = parseStrategy(JSON.stringify(body.strategy));
    const settings = body.settings;
    if (!settings || !Number.isFinite(settings.capital) || settings.capital <= 0 || settings.capital > 1e9 || !Number.isFinite(settings.feeBps) || settings.feeBps < 0 || settings.feeBps > 1000 || !Number.isFinite(settings.slippageBps) || settings.slippageBps < 0 || settings.slippageBps > 1000) throw new Error("Invalid backtest cost settings.");
    const start = Number(settings.start);
    const end = Number(settings.end);
    const bars = await getCandles(product, granularity, start, end);
    if (bars.length < 20) throw new Error("At least 20 candles are needed for a backtest.");
    const dataset = { id: "server", symbol: product, fileName: "Coinbase Exchange", importedAt: Date.now(), utcOffset: 0, point: 0, bars, skipped: 0 };
    const run = runBacktest(dataset, strategy, { ...settings, useMt5Spread: false }, String(body.strategyId || ""), String(body.name || "Crypto backtest").slice(0, 100));
    run.granularity = granularity;
    return res.status(200).json({ run, source: "Coinbase Exchange", bars: bars.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backtest failed.";
    const code = error?.status === 429 ? 429 : /Coinbase market data request failed/.test(message) ? 502 : 400;
    if (code === 429) res.setHeader("Retry-After", "60");
    return res.status(code).json({ error: message });
  }
}
