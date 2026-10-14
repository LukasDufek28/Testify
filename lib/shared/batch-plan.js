import { parseStrategy } from "./types.js";
function expandBatch(strategy, markets, periods, parameter, values) {
  const current = parseStrategy(strategy.source);
  if (!markets.length || !periods.length || !values.length || markets.length * periods.length * values.length > 24) throw new Error("A batch must contain between 1 and 24 child runs. Reduce markets, periods or parameter values.");
  if (values.some((v) => !Number.isFinite(v))) throw new Error("Parameter values must be finite numbers.");
  if (current.version === 3) {
    if (parameter && !Object.hasOwn(current.parameters ?? {}, parameter)) throw new Error("Choose an existing script parameter.");
  } else if (parameter && !["stopLossPct", "takeProfitPct", "allocationPct"].includes(parameter)) throw new Error("Choose a supported strategy parameter.");
  return markets.flatMap((symbol) => periods.flatMap((period, i) => {
    if (!Number.isFinite(Date.parse(period.start)) || !Number.isFinite(Date.parse(period.end)) || Date.parse(period.start) >= Date.parse(period.end)) throw new Error("Every batch period must have a valid start before its end.");
    return values.map((value) => {
      const strategy2 = structuredClone(current);
      if (parameter) {
        if (strategy2.version === 3) strategy2.parameters = { ...strategy2.parameters, [parameter]: value };
        else strategy2[parameter] = value;
      }
      return { symbol, ...period, source: JSON.stringify(parseStrategy(JSON.stringify(strategy2))), label: `${symbol} \xB7 Period ${i + 1}${parameter ? ` \xB7 ${parameter} ${value}` : ""}` };
    });
  }));
}
export {
  expandBatch
};
