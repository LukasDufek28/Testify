import { adversePrice, executionFee, validateExecutionOverrides } from "./execution-costs.js";
function replayBars(dataset, settings) {
  return dataset.bars.filter((b) => b.time >= settings.start && b.time <= settings.end);
}
function createManualSession(dataset, strategy, settings, name) {
  validateExecutionOverrides(settings);
  if (![settings.capital, settings.feeBps, settings.slippageBps, settings.start, settings.end].every(Number.isFinite) || settings.capital <= 0 || settings.feeBps < 0 || settings.slippageBps < 0 || settings.start >= settings.end) throw new Error("Invalid replay settings.");
  if (replayBars(dataset, settings).length < 2) throw new Error("Choose a dataset period with at least two candles.");
  return { id: crypto.randomUUID(), name, datasetId: dataset.id, strategyId: strategy.id, strategyName: strategy.name, strategySource: strategy.source, settings: { ...settings }, cursor: 0, cash: settings.capital, position: null, pending: null, closeRequested: false, trades: [], curve: [{ time: replayBars(dataset, settings)[0].time, equity: settings.capital }], totalFees: 0, status: "paused" };
}
function validateManualOrder(order, reference) {
  if (!order || ![1, -1].includes(order.side) || !["market", "limit", "stop"].includes(order.type) || ![order.price, order.stop, order.target, order.riskPct].every(Number.isFinite) || order.riskPct <= 0 || order.riskPct > 10) throw new Error("Use a supported order and risk between 0 and 10%.");
  const entry = order.type === "market" ? reference : order.price;
  if (entry <= 0 || order.stop <= 0 || order.target <= 0 || order.side * (entry - order.stop) <= 0 || order.side * (order.target - entry) <= 0) throw new Error("Place the stop on the loss side and target on the profit side of the entry.");
}
function manualOrderPreview(s, dataset) {
  const order = s.pending;
  if (!order) return null;
  const reference = replayBars(dataset, s.settings)[s.cursor].close;
  const mid = order.type === "market" ? reference : order.price;
  let entry = adversePrice(mid, order.side, true, s.settings);
  if (order.type === "limit") entry = order.side === 1 ? Math.min(entry, order.price) : Math.max(entry, order.price);
  const distance = Math.abs(entry - order.stop);
  const cap = Math.max(0, s.cash - (s.settings.feePerTrade ?? 0) / 2) / (entry * (1 + (s.settings.feePerTrade === void 0 ? s.settings.feeBps / 1e4 : 0)));
  return { units: distance > 0 ? Math.min(cap, s.cash * order.riskPct / 100 / distance) : 0, riskReward: distance > 0 ? Math.abs(order.target - entry) / distance : 0, entry };
}
function advanceManual(original, dataset, command) {
  const s = structuredClone(original);
  delete s._revision;
  const bars = replayBars(dataset, s.settings), current = bars[s.cursor];
  if (!current || s.status === "completed") throw new Error("This replay has finished. Create a new replay to start again.");
  if (command.type === "order") {
    if (s.position || s.pending) throw new Error("Only one open position or pending order is supported.");
    validateManualOrder(command.order, current.close);
    s.pending = { ...command.order };
    return s;
  }
  if (command.type === "cancel") {
    s.pending = null;
    return s;
  }
  if (command.type === "close") {
    if (!s.position) throw new Error("No position to close.");
    s.closeRequested = true;
    return s;
  }
  if (command.type === "edit") {
    if (!s.pending) throw new Error("Only pending orders can be edited. Cancel and replace other orders.");
    const order = { ...s.pending, stop: command.stop, target: command.target };
    validateManualOrder(order, current.close);
    s.pending = order;
    return s;
  }
  const seconds = bars.length > 1 ? bars[1].time - bars[0].time : 60;
  const close = (mid, bar2, reason, atClose = false) => {
    const p2 = s.position;
    if (!p2) return;
    const price = adversePrice(mid, p2.side, false, s.settings), fee = executionFee(p2.units, price, s.settings);
    const gross = p2.side * p2.units * (price - p2.entry);
    s.cash += gross - fee;
    s.totalFees += fee;
    const pnl = gross - fee - p2.entryFee;
    s.trades.push({ entryTime: p2.entryTime, exitTime: bar2.time + (atClose ? seconds : 0), side: p2.side, entry: p2.entry, exit: price, pnl, returnPct: pnl / p2.equityAtEntry * 100, rMultiple: p2.initialRisk > 0 ? pnl / p2.initialRisk : void 0, reason, stopLoss: p2.stop, takeProfit: p2.target });
    s.position = null;
    s.closeRequested = false;
  };
  if (command.type === "finish") {
    close(current.close, current, "End of replay", true);
    s.pending = null;
    s.status = "completed";
    s.curve[s.curve.length - 1].equity = s.cash;
    return s;
  }
  if (command.type !== "step") throw new Error("Unsupported replay action.");
  const bar = bars[s.cursor + 1];
  if (!bar) throw new Error("No more candles.");
  s.cursor++;
  if (s.closeRequested) close(bar.open, bar, "Manual close");
  if (s.pending && !s.position) {
    const o = s.pending;
    let mid = null;
    if (o.type === "market") mid = bar.open;
    else if (o.type === "limit" && (o.side === 1 ? bar.low <= o.price : bar.high >= o.price)) mid = o.side === 1 ? Math.min(bar.open, o.price) : Math.max(bar.open, o.price);
    else if (o.type === "stop" && (o.side === 1 ? bar.high >= o.price : bar.low <= o.price)) mid = o.side === 1 ? Math.max(bar.open, o.price) : Math.min(bar.open, o.price);
    if (mid !== null) {
      let entry = adversePrice(mid, o.side, true, s.settings);
      if (o.type === "limit") entry = o.side === 1 ? Math.min(entry, o.price) : Math.max(entry, o.price);
      if (o.side * (entry - o.stop) <= 0 || o.side * (o.target - entry) <= 0) {
        s.pending = null;
        throw new Error("The next candle gapped beyond the order stop or target. Cancel or adjust the pending order.");
      }
      const cap = Math.max(0, s.cash - (s.settings.feePerTrade ?? 0) / 2) / (entry * (1 + (s.settings.feePerTrade === void 0 ? s.settings.feeBps / 1e4 : 0)));
      const units = Math.min(cap, s.cash * o.riskPct / 100 / Math.abs(entry - o.stop)), fee = executionFee(units, entry, s.settings);
      if (units <= 0) throw new Error("There is not enough equity for this order.");
      s.position = { side: o.side, entry, entryTime: bar.time, units, stop: o.stop, target: o.target, equityAtEntry: s.cash, entryFee: fee, initialRisk: Math.abs(entry - o.stop) * units };
      s.cash -= fee;
      s.totalFees += fee;
      s.pending = null;
    }
  }
  const p = s.position;
  if (p) {
    if (p.side === 1 ? bar.low <= p.stop : bar.high >= p.stop) close(p.side === 1 ? Math.min(bar.open, p.stop) : Math.max(bar.open, p.stop), bar, "Stop loss", true);
    else if (p.side === 1 ? bar.high >= p.target : bar.low <= p.target) close(p.side === 1 ? Math.max(bar.open, p.target) : Math.min(bar.open, p.target), bar, "Take profit", true);
  }
  const held = s.position;
  s.curve.push({ time: bar.time + seconds, equity: s.cash + (held ? held.side * held.units * (bar.close - held.entry) : 0) });
  if (s.cursor === bars.length - 1) {
    close(bar.close, bar, "End of replay", true);
    s.pending = null;
    s.status = "completed";
    s.curve[s.curve.length - 1].equity = s.cash;
  }
  return s;
}
function manualResult(s, dataset) {
  let peak = s.settings.capital, drawdown = 0;
  for (const p of s.curve) {
    peak = Math.max(peak, p.equity);
    drawdown = Math.max(drawdown, (peak - p.equity) / peak * 100);
  }
  const bars = replayBars(dataset, s.settings), seconds = bars.length > 1 ? bars[1].time - bars[0].time : 60;
  return { mode: "manual", id: s.id, name: s.name, createdAt: Date.now(), symbol: dataset.symbol, datasetId: dataset.id, granularity: dataset.bars.length > 1 ? dataset.bars[1].time - dataset.bars[0].time : 60, strategyId: s.strategyId, strategyName: s.strategyName, strategySource: s.strategySource, settings: { ...s.settings, end: Math.min(s.settings.end, bars[s.cursor].time + seconds) }, trades: s.trades, curve: s.curve, metrics: { netReturnPct: (s.cash / s.settings.capital - 1) * 100, maxDrawdownPct: drawdown, tradeCount: s.trades.length, winRatePct: s.trades.length ? s.trades.filter((t) => t.pnl > 0).length / s.trades.length * 100 : 0, sharpe: null, totalFees: s.totalFees }, warnings: ["Manual replay: actions submitted after a candle close become active on the next candle.", "One position per market, no leverage. Risk sizing is capped at available equity.", "Stops are filled before targets when both are touched in one candle. Short positions on spot history are synthetic.", "Sharpe is not calculated for manual replay."] };
}
export {
  advanceManual,
  createManualSession,
  manualOrderPreview,
  manualResult,
  replayBars,
  validateManualOrder
};
