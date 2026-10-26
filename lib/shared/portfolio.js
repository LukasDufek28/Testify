function calendarMonthlyReturns(series) {
  if (!series || !Number.isFinite(series.settings.capital) || series.settings.capital <= 0) return [];
  const points = series.curve.filter((p) => Number.isFinite(p.time) && Number.isFinite(p.equity)).sort((a, b) => a.time - b.time);
  if (!points.length) return [];
  const endings = /* @__PURE__ */ new Map();
  for (const point of points) {
    const date = new Date(point.time * 1e3);
    if (!Number.isFinite(date.getTime())) continue;
    endings.set(date.getUTCFullYear() * 12 + date.getUTCMonth(), point.equity);
  }
  if (!endings.size) return [];
  const keys = [...endings.keys()], first = keys[0], last = keys.at(-1);
  let previous = series.settings.capital;
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const index = first + i, year = Math.floor(index / 12), month = index % 12, end = endings.get(index) ?? previous, profit = end - previous;
    const result = { key: `${year}-${String(month + 1).padStart(2, "0")}`, year, month, profit: Math.abs(profit) < 1e-8 ? 0 : profit, returnPct: previous > 0 ? (end / previous - 1) * 100 : null };
    previous = end;
    return result;
  });
}
function aggregateRunPortfolio(runs) {
  const valid = runs.filter((run) => Number.isFinite(run.settings.capital) && run.settings.capital > 0 && run.curve.length && run.curve.every((point, i) => Number.isFinite(point.time) && Number.isFinite(point.equity) && (!i || point.time >= run.curve[i - 1].time)));
  const capital = valid.reduce((sum, run) => sum + run.settings.capital, 0);
  const changes = /* @__PURE__ */ new Map();
  for (const run of valid) {
    let previous = run.settings.capital;
    for (const point of run.curve) {
      changes.set(point.time, (changes.get(point.time) ?? 0) + point.equity - previous);
      previous = point.equity;
    }
  }
  let equity = capital, peak = capital, maxDrawdown = 0, maxDrawdownPct = 0;
  const curve = [...changes.entries()].sort(([a], [b]) => a - b).map(([time, change]) => {
    equity += change;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, (peak - equity) / peak * 100);
    return { time, equity };
  });
  const netProfit = curve.length ? curve[curve.length - 1].equity - capital : 0;
  return { capital, curve, netProfit, returnPct: capital ? netProfit / capital * 100 : 0, maxDrawdown, maxDrawdownPct, runCount: valid.length, excludedCount: runs.length - valid.length, summaryCount: valid.filter((run) => run.summaryOnly).length };
}
function combinePortfolio(runs) {
  const valid = runs.filter((run) => run.settings.capital > 0 && run.curve.length);
  if (!valid.length) return { curve: [], returnPct: 0, maxDrawdownPct: 0, capital: 0 };
  const capital = valid[0].settings.capital;
  const times = [...new Set(valid.flatMap((run) => run.curve.map((point) => point.time)))].sort((a, b) => a - b);
  const indices = valid.map(() => -1);
  const curve = times.map((time) => {
    let summedReturn = 0;
    valid.forEach((run, index) => {
      while (indices[index] + 1 < run.curve.length && run.curve[indices[index] + 1].time <= time) indices[index]++;
      if (indices[index] >= 0) summedReturn += run.curve[indices[index]].equity / run.settings.capital - 1;
    });
    return { time, equity: capital * (1 + summedReturn) };
  });
  let peak = capital;
  let maxDrawdownPct = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, (peak - point.equity) / peak * 100);
  }
  return { curve, returnPct: valid.reduce((sum, run) => sum + run.metrics.netReturnPct, 0), maxDrawdownPct, capital };
}
export {
  aggregateRunPortfolio,
  calendarMonthlyReturns,
  combinePortfolio
};
