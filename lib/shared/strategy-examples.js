const adaptiveTrendStrategy = {
  version: 3,
  runtime: "javascript",
  name: "Adaptive Trend Breakout",
  description: "EMA regime and slope filter, prior-candle breakouts, Wilder ATR volatility filter, 2 ATR initial stop, ratcheting 3 ATR trailing stop and prior 10-candle channel exits. Risks 0.5% equity, capped at 100% notional. Intended for completed 4H OHLCV candles. Costs and dates are configured in Backtests; funding requires supplied historical events. No performance claims.",
  parameters: { fastEMA: 50, slowEMA: 200, slopeBars: 5, breakoutBars: 20, exitBars: 10, atrPeriod: 14, initialATR: 2, trailingATR: 3, riskPct: 0.5, minATRRatio: 5e-3, maxATRRatio: 0.08 },
  code: `const state = { count: 0, fastSum: 0, slowSum: 0, fast: null, slow: null, atrSum: 0, atr: null, slopes: [] };
function onBar(ctx) {
  const p = ctx.parameters, b = ctx.bar, h = ctx.history, i = ctx.index;
  state.count++;
  if (state.count <= p.fastEMA) { state.fastSum += b.close; if (state.count === p.fastEMA) state.fast = state.fastSum / p.fastEMA; }
  else state.fast += (b.close - state.fast) * 2 / (p.fastEMA + 1);
  if (state.count <= p.slowEMA) { state.slowSum += b.close; if (state.count === p.slowEMA) state.slow = state.slowSum / p.slowEMA; }
  else state.slow += (b.close - state.slow) * 2 / (p.slowEMA + 1);
  const prevClose = i ? h[i - 1].close : b.close;
  const tr = Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  if (state.count <= p.atrPeriod) { state.atrSum += tr; if (state.count === p.atrPeriod) state.atr = state.atrSum / p.atrPeriod; }
  else state.atr = (state.atr * (p.atrPeriod - 1) + tr) / p.atrPeriod;
  if (state.slow !== null) { state.slopes.push(state.slow); if (state.slopes.length > p.slopeBars + 1) state.slopes.shift(); }
  if (state.fast === null || state.slow === null || state.atr === null || state.slopes.length < p.slopeBars + 1 || i < Math.max(p.breakoutBars, p.exitBars)) return {};
  let upper = -Infinity, lower = Infinity, exitUpper = -Infinity, exitLower = Infinity;
  for (let j = i - p.breakoutBars; j < i; j++) { upper = Math.max(upper, h[j].high); lower = Math.min(lower, h[j].low); }
  for (let j = i - p.exitBars; j < i; j++) { exitUpper = Math.max(exitUpper, h[j].high); exitLower = Math.min(exitLower, h[j].low); }
  if (ctx.position) {
    const pos = ctx.position;
    return pos.side === 'long'
      ? { stopPrice: Math.max(pos.stopPrice, pos.highestHigh - p.trailingATR * state.atr), exit: b.close < exitLower }
      : { stopPrice: Math.min(pos.stopPrice, pos.lowestLow + p.trailingATR * state.atr), exit: b.close > exitUpper };
  }
  const ratio = state.atr / b.close;
  if (ratio < p.minATRRatio || ratio > p.maxATRRatio) return {};
  const rising = state.slow > state.slopes[0], falling = state.slow < state.slopes[0];
  if (state.fast > state.slow && rising && b.close > upper) return { entry: { side: 'long', stopDistance: p.initialATR * state.atr, riskPct: p.riskPct, allocationPct: 100 } };
  if (state.fast < state.slow && falling && b.close < lower) return { entry: { side: 'short', stopDistance: p.initialATR * state.atr, riskPct: p.riskPct, allocationPct: 100 } };
  return {};
}`
};
export {
  adaptiveTrendStrategy
};
