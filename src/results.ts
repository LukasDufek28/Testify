import { parseStrategy, type Run, type Trade, type RuleStrategy, type EquityPoint } from "./types.js";
const rulesCache=new WeakMap<Run,{source:string|undefined;rules:RuleStrategy|null}>();
export function savedRules(run: Run) { const cached=rulesCache.get(run);if(cached&&cached.source===run.strategySource)return cached.rules;let rules:RuleStrategy|null=null;try{const parsed=run.strategySource?parseStrategy(run.strategySource):null;rules=parsed?.version === 3 ? null : parsed;}catch{/* Older snapshots can be unavailable. */}rulesCache.set(run,{source:run.strategySource,rules});return rules; }
export function tradeR(run: Run, trade: Trade) { if (Number.isFinite(trade.rMultiple)) return trade.rMultiple!; const rules=savedRules(run); const riskPct=rules ? rules.allocationPct*rules.stopLossPct/100 : 0; return riskPct>0 ? trade.returnPct/riskPct : null; }
export function resultMetrics(run: Run) {
  const profit=run.trades.reduce((sum,t)=>sum+Math.max(0,t.pnl),0);
  const loss=run.trades.reduce((sum,t)=>sum+Math.max(0,-t.pnl),0);
  const multiples=run.trades.map(t=>tradeR(run,t)).filter((r):r is number=>r!==null&&Number.isFinite(r));
  return {netProfit:run.settings.capital*run.metrics.netReturnPct/100,profitFactor:loss>0 ? profit/loss : profit>0 ? Infinity : null,averageR:multiples.length ? multiples.reduce((a,b)=>a+b,0)/multiples.length : null};
}
export function drawdownCurve(run: Run) {let peak=run.settings.capital;return run.curve.map(point=>{peak=Math.max(peak,point.equity);return {time:point.time,equity:peak>0?(point.equity/peak-1)*100:0};});}
export function monthlyReturns(run: Run) {
  const months=new Map<string,number>();for(const point of run.curve)months.set(new Date(point.time*1000).toISOString().slice(0,7),point.equity);
  let previous=run.settings.capital;return [...months].map(([month,equity])=>{const value=previous>0?(equity/previous-1)*100:0;previous=equity;return {month,value};});
}
export function csvCell(value: unknown) { const text=String(value??''); const safe=/^[=+@\-\t\r]/.test(text)&&typeof value==='string' ? `'${text}`:text;return `"${safe.replaceAll('"','""')}"`; }
export function csvRows(rows:unknown[][]) { return rows.map(row=>row.map(csvCell).join(',')).join('\r\n'); }
export function tradesCsv(run: Run) {return csvRows([['Run','Strategy','Market','Entry UTC','Exit UTC','Side','Entry price','Exit price','Net P/L','Return %','R','Exit reason'],...run.trades.map(t=>[run.name,run.strategyName,run.symbol,new Date(t.entryTime*1000).toISOString(),new Date(t.exitTime*1000).toISOString(),t.side===1?'Long':'Short',t.entry,t.exit,t.pnl,t.returnPct,tradeR(run,t),t.reason])]);}
export function comparisonCsv(runs:Run[]) {return csvRows([['Run','Strategy','Market','Timeframe seconds','Start UTC','End UTC','Starting capital','Fee bps','Slippage bps','Fixed fee per round trip','Spread bps','Risk % equity','Return %','Max drawdown %','Win rate %','Trades','Profit factor','Average R'],...runs.map(run=>{const m=resultMetrics(run);return [run.name,run.strategyName,run.symbol,run.granularity,new Date(run.settings.start*1000).toISOString(),new Date(run.settings.end*1000).toISOString(),run.settings.capital,run.settings.feeBps,run.settings.slippageBps,run.settings.feePerTrade,run.settings.spreadBps??0,run.settings.riskPct??0,run.metrics.netReturnPct,run.metrics.maxDrawdownPct,run.metrics.winRatePct,run.metrics.tradeCount,m.profitFactor,m.averageR];})]);}

export function sampleCurve(points:EquityPoint[],limit=1800):EquityPoint[] {
  if(points.length<=limit)return points;
  const size=Math.ceil((points.length-2)/Math.max(1,Math.floor((limit-2)/2)));
  const sampled=[points[0]];
  for(let start=1;start<points.length-1;start+=size){const end=Math.min(points.length-1,start+size);let low=start,high=start;for(let i=start+1;i<end;i++){if(points[i].equity<points[low].equity)low=i;if(points[i].equity>points[high].equity)high=i;}sampled.push(points[Math.min(low,high)]);if(low!==high)sampled.push(points[Math.max(low,high)]);}
  sampled.push(points[points.length-1]);return sampled;
}