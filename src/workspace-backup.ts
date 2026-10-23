import {parseStrategy,type Dataset,type Run,type SavedStrategy} from './types';

export type WorkspaceBackup={format:'testify-backup-v1';datasets:Dataset[];strategies:SavedStrategy[];runs:Run[]};
const canonical=(value:unknown)=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).filter(k=>k!=='_revision').sort().map(k=>[k,v[k]])):v);

export function parseBackup(text:string):WorkspaceBackup {
  const backup=JSON.parse(text) as WorkspaceBackup;
  if(!backup||backup.format!=='testify-backup-v1'||!Array.isArray(backup.datasets)||!Array.isArray(backup.strategies)||!Array.isArray(backup.runs))throw new Error('Choose a Testify workspace backup JSON file.');
  for(const records of [backup.datasets,backup.strategies,backup.runs]){
    const ids=new Set<string>();
    for(const record of records){if(!record||typeof record.id!=='string'||!record.id||record.id.length>128||ids.has(record.id))throw new Error('Backup contains invalid or duplicate record IDs.');ids.add(record.id);}
  }
  for(const dataset of backup.datasets){
    if(typeof dataset.symbol!=='string'||typeof dataset.fileName!=='string'||!Array.isArray(dataset.bars)||!dataset.bars.length||dataset.bars.length>20000||dataset.bars.some((bar,i)=>!bar||!['time','open','high','low','close','volume'].every(key=>Number.isFinite(bar[key as keyof typeof bar]))||bar.time<0||bar.low<=0||bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close)||bar.volume<0||(i>0&&bar.time<=dataset.bars[i-1].time)))throw new Error('Backup datasets need up to 20,000 valid, ordered candles each.');
  }
  for(const strategy of backup.strategies)parseStrategy(strategy.source);
  for(const run of backup.runs){
    if(typeof run.name!=='string'||typeof run.symbol!=='string'||typeof run.strategyId!=='string'||typeof run.strategyName!=='string'||!Number.isFinite(run.createdAt)||!run.settings||!['capital','start','end','feeBps','slippageBps'].every(key=>Number.isFinite(run.settings[key as keyof typeof run.settings]))||run.settings.capital<=0||!run.metrics||!['netReturnPct','maxDrawdownPct','winRatePct','tradeCount','totalFees'].every(key=>Number.isFinite(run.metrics[key as keyof typeof run.metrics]))||!Array.isArray(run.curve)||run.curve.some(point=>!point||!Number.isFinite(point.time)||!Number.isFinite(point.equity))||!Array.isArray(run.trades)||run.trades.some(trade=>!trade||!['entryTime','exitTime','entry','exit','pnl','returnPct'].every(key=>Number.isFinite(trade[key as keyof typeof trade]))||![1,-1].includes(trade.side)||typeof trade.reason!=='string')||(run.warnings!==undefined&&(!Array.isArray(run.warnings)||run.warnings.some(w=>typeof w!=='string'))))throw new Error('Backup contains an incomplete backtest snapshot.');
    if(run.strategySource)parseStrategy(run.strategySource);
    run.strategySource??='';
    run.warnings??=[];
  }
  return backup;
}

// Check every conflict before writing. Existing versions are never overwritten.
export function missingBackupRecords(backup:WorkspaceBackup,existing:Omit<WorkspaceBackup,'format'>){
  const datasets=backup.datasets.filter(dataset=>{
    const saved=existing.datasets.find(item=>item.id===dataset.id);
    if(saved&&canonical(saved)!==canonical(dataset))throw new Error(`Dataset ${dataset.fileName} conflicts with an existing snapshot. No backup records were imported.`);
    return !saved;
  });
  const strategies=backup.strategies.filter(strategy=>{
    const saved=existing.strategies.find(item=>item.id===strategy.id);
    if(saved&&canonical(parseStrategy(saved.source))!==canonical(parseStrategy(strategy.source)))throw new Error(`Strategy ${strategy.name} has a newer or different saved version. Import its strategy JSON separately to keep both. No backup records were imported.`);
    return !saved;
  }).map(strategy=>({...strategy,revision:0}));
  const runs=backup.runs.filter(run=>{
    const saved=existing.runs.find(item=>item.id===run.id);
    if(saved){const {name:_,...a}=saved,{name:__,...b}=run;if(canonical(a)!==canonical(b))throw new Error(`Backtest ${run.name} conflicts with an existing snapshot. No backup records were imported.`);}
    return !saved;
  });
  return {datasets,strategies,runs};
}
