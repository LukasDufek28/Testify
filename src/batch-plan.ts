import {parseStrategy,type SavedStrategy} from './types.js';
export type BatchChild={symbol:string;start:string;end:string;source:string;label:string};
export type BatchPlan={name:string;strategyId:string;strategyName:string;datasetId:string;granularity:number;capital:number;riskPct?:number;spreadBps?:number;feePerTrade?:number;feeBps:number;slippageBps:number;splitPct:number;children:BatchChild[]};
export function expandBatch(strategy:SavedStrategy,markets:string[],periods:{start:string;end:string}[],parameter:string,values:number[]):BatchChild[]{
  const current=parseStrategy(strategy.source);
  if(!markets.length||!periods.length||!values.length||markets.length*periods.length*values.length>24)throw new Error('A batch must contain between 1 and 24 child runs. Reduce markets, periods or parameter values.');
  if(values.some(v=>!Number.isFinite(v)))throw new Error('Parameter values must be finite numbers.');
  if(current.version===3){if(parameter&&!Object.hasOwn(current.parameters??{},parameter))throw new Error('Choose an existing script parameter.');}
  else if(parameter&&!['stopLossPct','takeProfitPct','allocationPct'].includes(parameter))throw new Error('Choose a supported strategy parameter.');
  return markets.flatMap(symbol=>periods.flatMap((period,i)=>{
    if(!Number.isFinite(Date.parse(period.start))||!Number.isFinite(Date.parse(period.end))||Date.parse(period.start)>=Date.parse(period.end))throw new Error('Every batch period must have a valid start before its end.');
    return values.map(value=>{const strategy=structuredClone(current);if(parameter){if(strategy.version===3)strategy.parameters={...strategy.parameters,[parameter]:value};else strategy[parameter as 'stopLossPct'|'takeProfitPct'|'allocationPct']=value;}
      return {symbol,...period,source:JSON.stringify(parseStrategy(JSON.stringify(strategy))),label:`${symbol} · Period ${i+1}${parameter?` · ${parameter} ${value}`:''}`};});
  }));
}
