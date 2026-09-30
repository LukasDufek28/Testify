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
  combinePortfolio
};
