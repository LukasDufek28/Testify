import type {BacktestSettings} from './types';
export function adversePrice(price:number,side:1|-1,entering:boolean,settings:BacktestSettings){return price*(1+(entering?side:-side)*(settings.slippageBps+(settings.spreadBps??0)/2)/10000);}
export function executionFee(units:number,price:number,settings:BacktestSettings,fraction=1){return settings.feePerTrade!==undefined?settings.feePerTrade/2*fraction:Math.abs(units*price)*settings.feeBps/10000;}
export function validateExecutionOverrides(settings:BacktestSettings){
  if(settings.feePerTrade!==undefined&&(!Number.isFinite(settings.feePerTrade)||settings.feePerTrade<0||settings.feePerTrade>1e9))throw new Error('Fixed trade fee must be between 0 and 1,000,000,000.');
  if(settings.riskPct!==undefined&&(!Number.isFinite(settings.riskPct)||settings.riskPct<0||settings.riskPct>10))throw new Error('Risk must be between 0 and 10% of equity.');
  if(settings.spreadBps!==undefined&&(!Number.isFinite(settings.spreadBps)||settings.spreadBps<0||settings.spreadBps>1000))throw new Error('Spread must be between 0 and 1000 basis points.');
}
