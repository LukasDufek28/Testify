import { createHash } from "node:crypto";
import { combinePortfolio } from "../shared/portfolio.js";
export const digestSource = source => createHash("sha256").update(source).digest("hex");
export function summarizeRun(run) {
  const daily = new Map();
  for (const point of run.curve) daily.set(Math.floor(point.time / 86400), point);
  const points = [run.curve[0], ...daily.values(), run.curve.at(-1)].filter(Boolean);
  const curve = [...new Map(points.map(p => [p.time, { time:p.time,equity:p.equity }])).values()].sort((a,b)=>a.time-b.time);
  const reasons = Object.create(null), trades = run.trades || [];
  let wins=0, profit=0, loss=0, rTotal=0, rCount=0;
  for (const trade of trades) {
    if (trade.pnl > 0) { wins++; profit+=trade.pnl; } else loss-=trade.pnl;
    reasons[trade.reason] = (reasons[trade.reason] || 0)+1;
    if (Number.isFinite(trade.rMultiple)) { rTotal+=trade.rMultiple;rCount++; }
  }
  return { id:run.id,name:run.name,createdAt:run.createdAt,symbol:run.symbol,granularity:run.granularity,
    strategyId:run.strategyId,strategyName:run.strategyName,strategySource:run.strategySource,
    sourceHash:digestSource(run.strategySource || ""),strategyRevision:run.strategyRevision,
    engineVersion:run.engineVersion || "testify-web-1",research:run.research,settings:run.settings,
    metrics:{...run.metrics,profitFactor:run.metrics.profitFactor ?? (loss>0?profit/loss:null),averageRMultiple:run.metrics.averageRMultiple ?? (rCount?rTotal/rCount:null)},
    curve,trades:[],warnings:run.warnings || [],summaryOnly:true,curveResolution:"daily",tradeLogs:"not_stored",
    aggregate:{wins,profit,loss,rTotal,rCount,exitReasons:reasons}, coverage:run.coverage };
}
export function summarizePortfolio(runs) {
  const portfolio = combinePortfolio(runs);
  const tradeCount = runs.reduce((a,r)=>a+r.metrics.tradeCount,0);
  const profit = runs.reduce((a,r)=>a+(r.aggregate?.profit || 0),0), loss=runs.reduce((a,r)=>a+(r.aggregate?.loss || 0),0);
  const daily=new Map();for(const p of portfolio.curve)daily.set(Math.floor(p.time/86400),p.equity);
  const days=[...daily.entries()],returns=days.slice(1).map(([day,value],i)=>({gap:day-days[i][0],value:days[i][1]>0?value/days[i][1]-1:NaN}));
  const values=returns.map(r=>r.value),mean=values.reduce((a,b)=>a+b,0)/(values.length||1);
  const variance=values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length||1);
  const rCount=runs.reduce((a,r)=>a+(r.aggregate?.rCount||0),0),rTotal=runs.reduce((a,r)=>a+(r.aggregate?.rTotal||0),0);
  return { ...portfolio,runCount:runs.length,runIds:runs.map(r=>r.id),tradeCount,
    totalFees:runs.reduce((a,r)=>a+r.metrics.totalFees,0),profitFactor:loss>0?profit/loss:null,
    sharpe:values.length>=20 && returns.every(r=>r.gap===1&&Number.isFinite(r.value)) && variance>0?mean/Math.sqrt(variance)*Math.sqrt(365):null,
    sharpeMethod:"Daily sampled equity returns, annualized with 365 days; unavailable with sparse days or nonpositive prior equity.",
    averageRMultiple:rCount?rTotal/rCount:null,totalSleeveCapital:runs.reduce((a,r)=>a+r.settings.capital,0),
    winRatePct:tradeCount?runs.reduce((a,r)=>a+(r.aggregate?.wins || 0),0)/tradeCount*100:0,
    sampling:"daily-sampled estimate; intraday portfolio drawdown is unavailable",
    accounting:"Sum of full-capital sleeve returns against reference capital, not a shared-cash portfolio. Effective deployed capital grows with run count.",
    periods:runs.map(r=>({id:r.id,start:r.settings.start,end:r.settings.end,phase:r.research?.phase || "unclassified"})),
    markets:runs.map(r=>({symbol:r.symbol,returnPct:r.metrics.netReturnPct})),
    warnings:[...new Set(runs.flatMap(r=>r.warnings || []))] };
}
