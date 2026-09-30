const key = (i) => `${i.kind}:${i.period ?? 0}`;
function indicatorSeries(bars, indicator) {
  const { kind, period = 0 } = indicator;
  if (["open", "high", "low", "close"].includes(kind)) return bars.map((b) => b[kind]);
  const close = bars.map((b) => b.close);
  const output = Array(bars.length).fill(NaN);
  if (kind === "sma") {
    let sum = 0;
    for (let i = 0; i < close.length; i++) {
      sum += close[i];
      if (i >= period) sum -= close[i - period];
      if (i >= period - 1) output[i] = sum / period;
    }
  } else if (kind === "ema") {
    let sum = 0;
    const k = 2 / (period + 1);
    for (let i = 0; i < close.length; i++) {
      if (i < period) sum += close[i];
      if (i === period - 1) output[i] = sum / period;
      else if (i >= period) output[i] = close[i] * k + output[i - 1] * (1 - k);
    }
  } else if (kind === "rsi") {
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < close.length; i++) {
      const change = close[i] - close[i - 1];
      const gain = Math.max(0, change);
      const loss = Math.max(0, -change);
      if (i <= period) {
        gains += gain;
        losses += loss;
        if (i === period) output[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
      } else {
        gains = gains * (period - 1) / period + gain;
        losses = losses * (period - 1) / period + loss;
        output[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
      }
    }
  }
  return output;
}
function buildSeries(bars, strategy) {
  const indicators = [];
  for (const list of [strategy.entryLong, strategy.entryShort, strategy.exitLong, strategy.exitShort]) for (const rule of list) {
    indicators.push(rule.left);
    if (typeof rule.right !== "number") indicators.push(rule.right);
  }
  const series = /* @__PURE__ */ new Map();
  for (const i of indicators) if (!series.has(key(i))) series.set(key(i), indicatorSeries(bars, i));
  return series;
}
function matches(rule, index, series) {
  const left = series.get(key(rule.left));
  const right = typeof rule.right === "number" ? null : series.get(key(rule.right));
  const a = left[index];
  const b = right ? right[index] : rule.right;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (rule.op === "gt") return a > b;
  if (rule.op === "lt") return a < b;
  if (index === 0) return false;
  const prevA = left[index - 1];
  const prevB = right ? right[index - 1] : rule.right;
  if (!Number.isFinite(prevA) || !Number.isFinite(prevB)) return false;
  return rule.op === "crosses_above" ? prevA <= prevB && a > b : prevA >= prevB && a < b;
}
const all = (rules, index, series) => rules.length > 0 && rules.every((r) => matches(r, index, series));
function runBacktest(dataset, strategy, settings, strategyId, name) {
  if (!(settings.capital > 0) || !Number.isFinite(settings.capital)) throw new Error("Starting capital must be positive.");
  if (settings.feeBps < 0 || settings.slippageBps < 0 || !Number.isFinite(settings.feeBps + settings.slippageBps)) throw new Error("Trading costs must be nonnegative.");
  const bars = dataset.bars.filter((b) => b.time >= settings.start && b.time <= settings.end);
  if (bars.length < 20) throw new Error("The selected date range needs at least 20 bars.");
  const series = buildSeries(bars, strategy);
  let cash = settings.capital;
  let position = null;
  let pending = 0;
  let totalFees = 0;
  const curve = [];
  const trades = [];
  const warnings = [];
  if (!settings.useMt5Spread || bars.every((b) => b.spread === 0)) warnings.push("MT5 spread is unavailable or disabled; only the entered fee and slippage assumptions were charged.");
  const adverse = (mid, bar, side, entering) => {
    const spread = settings.useMt5Spread ? bar.spread * dataset.point / 2 : 0;
    const slip = mid * settings.slippageBps / 1e4;
    const direction = entering ? side : -side;
    return mid + direction * (spread + slip);
  };
  const exit = (mid, bar, reason) => {
    if (!position) return;
    const p = position;
    const price = adverse(mid, bar, p.side, false);
    const fee = Math.abs(p.units * price) * settings.feeBps / 1e4;
    const pnl = p.side * p.units * (price - p.entry) - fee;
    cash += pnl;
    totalFees += fee;
    trades.push({ entryTime: p.entryTime, exitTime: bar.time, side: p.side, entry: p.entry, exit: price, pnl: pnl - p.entryFee, returnPct: (pnl - p.entryFee) / p.equityAtEntry * 100, reason });
    position = null;
  };
  const enter = (side, bar) => {
    const price = adverse(bar.open, bar, side, true);
    const equityAtEntry = cash;
    const units = cash * strategy.allocationPct / 100 / price;
    const fee = Math.abs(units * price) * settings.feeBps / 1e4;
    cash -= fee;
    totalFees += fee;
    position = { side, entry: price, entryTime: bar.time, units, equityAtEntry, entryFee: fee };
  };
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (pending === 2) exit(bar.open, bar, "Signal");
    else if (pending === 1 || pending === -1) {
      if (position) exit(bar.open, bar, "Reverse signal");
      if (cash > 0) enter(pending, bar);
    }
    pending = 0;
    if (position) {
      const p = position;
      const stop = strategy.stopLossPct ? p.entry * (1 - p.side * strategy.stopLossPct / 100) : null;
      const take = strategy.takeProfitPct ? p.entry * (1 + p.side * strategy.takeProfitPct / 100) : null;
      const hitStop = stop !== null && (p.side === 1 ? bar.low <= stop : bar.high >= stop);
      const hitTake = take !== null && (p.side === 1 ? bar.high >= take : bar.low <= take);
      if (hitStop) exit(p.side === 1 ? Math.min(stop, bar.open) : Math.max(stop, bar.open), bar, "Stop loss");
      else if (hitTake) exit(p.side === 1 ? Math.max(take, bar.open) : Math.min(take, bar.open), bar, "Take profit");
    }
    const marked = position;
    const equity = marked ? cash + marked.side * marked.units * (bar.close - marked.entry) : cash;
    curve.push({ time: bar.time, equity });
    if (i === bars.length - 1) break;
    if (position) {
      const p = position;
      if (p.side === 1 && all(strategy.exitLong, i, series)) pending = 2;
      else if (p.side === -1 && all(strategy.exitShort, i, series)) pending = 2;
      else if (p.side === 1 && strategy.side !== "long" && all(strategy.entryShort, i, series)) pending = -1;
      else if (p.side === -1 && strategy.side !== "short" && all(strategy.entryLong, i, series)) pending = 1;
    } else if (strategy.side !== "short" && all(strategy.entryLong, i, series)) pending = 1;
    else if (strategy.side !== "long" && all(strategy.entryShort, i, series)) pending = -1;
  }
  if (position) {
    const last = bars[bars.length - 1];
    exit(last.close, last, "End of test");
    curve[curve.length - 1].equity = cash;
  }
  let peak = settings.capital;
  let maxDrawdownPct = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, (peak - point.equity) / peak * 100);
  }
  const dailyClose = /* @__PURE__ */ new Map();
  for (const p of curve) dailyClose.set(new Date(p.time * 1e3).toISOString().slice(0, 10), p.equity);
  const days = [...dailyClose.values()];
  const returns = days.slice(1).map((value, i) => days[i] > 0 ? value / days[i] - 1 : 0);
  const avg = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
  const variance = returns.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, returns.length - 1);
  const intervals = bars.slice(1).map((b, i) => b.time - bars[i].time).filter((v) => v > 0).sort((a, b) => a - b);
  const barSeconds = intervals[Math.floor(intervals.length / 2)] || 60;
  const sharpe = returns.length >= 20 && variance > 0 ? avg / Math.sqrt(variance) * Math.sqrt(252) : null;
  if (returns.length < 20) warnings.push("Sharpe needs at least 20 daily returns, so it is unavailable for this short sample.");
  const gapCount = intervals.filter((v) => v > barSeconds * 3).length;
  if (gapCount) warnings.push(`${gapCount} gaps exceed three bar intervals; weekends and missing history can affect results.`);
  warnings.push("Bars do not reveal intrabar order; if stop and target both hit, the stop is assumed first.");
  return { id: crypto.randomUUID(), name, createdAt: Date.now(), symbol: dataset.symbol, strategyId, strategyName: strategy.name, settings, metrics: { netReturnPct: (cash / settings.capital - 1) * 100, maxDrawdownPct, sharpe, winRatePct: trades.length ? trades.filter((t) => t.pnl > 0).length / trades.length * 100 : 0, tradeCount: trades.length, totalFees }, curve, trades, warnings };
}
export {
  runBacktest
};
