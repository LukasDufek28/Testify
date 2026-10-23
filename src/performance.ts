import type {EquityPoint} from './types';

/** Sample Sharpe from consecutive UTC daily closes, 0% benchmark, 365 periods/year. */
const estimates=new WeakMap<EquityPoint[],ReturnType<typeof calculateDailySharpe>>();
export function dailySharpeEstimate(curve:EquityPoint[]){
  const existing=estimates.get(curve);if(existing)return existing;
  const result=calculateDailySharpe(curve);estimates.set(curve,result);return result;
}
function calculateDailySharpe(curve:EquityPoint[]){
  const daily=new Map<number,number>();let previousTime=-Infinity;
  const unavailable=(reason:string,count=0)=>({value:null as number|null,count,shortSample:count<20,reason});
  for(const point of curve){
    if(!Number.isFinite(point.time)||!Number.isFinite(point.equity)||point.equity<=0||point.time<previousTime)return unavailable('Positive, ordered equity is required.');
    daily.set(Math.floor(point.time/86400),point.equity);previousTime=point.time;
  }
  const days=[...daily.entries()];
  if(days.length<3)return unavailable('Needs at least two daily returns.',Math.max(0,days.length-1));
  if(days.some(([day],i)=>i>0&&day!==days[i-1][0]+1))return unavailable('Daily equity has missing dates.',days.length-1);
  const returns=days.slice(1).map(([,equity],i)=>equity/days[i][1]-1);
  const mean=returns.reduce((sum,value)=>sum+value,0)/returns.length;
  const variance=returns.reduce((sum,value)=>sum+(value-mean)**2,0)/(returns.length-1);
  if(Math.max(...returns)-Math.min(...returns)<=Number.EPSILON*Math.max(1,Math.abs(mean))*8)return unavailable('Daily returns have no variability.',returns.length);
  const value=mean/Math.sqrt(variance)*Math.sqrt(365);
  return {value:Number.isFinite(value)?value:null,count:returns.length,shortSample:returns.length<20,reason:''};
}
