import {database,requireUser,checkOrigin,authFailure,AuthError} from '../lib/auth.js';
import {ensureWorkspaceSchema,listRecords,putRecord,deleteRecord} from '../lib/workspace-records.js';
import {resultMetrics,drawdownCurve,monthlyReturns,tradesCsv,comparisonCsv} from '../lib/shared/results.js';
const summary=run=>{const metrics=resultMetrics(run);return {id:run.id,name:run.name,strategyId:run.strategyId,strategyName:run.strategyName,strategySource:run.strategySource,symbol:run.symbol,granularity:run.granularity,datasetId:run.datasetId,mode:run.mode??'automatic',settings:run.settings,metrics:{...run.metrics,...metrics,profitFactor:Number.isFinite(metrics.profitFactor)?metrics.profitFactor:null,profitFactorInfinite:metrics.profitFactor===Infinity},curve:run.curve,drawdown:drawdownCurve(run),monthlyReturns:monthlyReturns(run)};};
export function createWorkspaceHandler(authorize=requireUser,connect=database){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
  const user=await authorize(req,res,'workspace',300);if(!user)return;
  try{
    if(req.method!=='GET')checkOrigin(req);
    const sql=connect();await ensureWorkspaceSchema(sql);
    if(req.method==='GET'){
      const kind=String(req.query?.kind||''),records=await listRecords(sql,user.id,kind);
      if(kind==='runs'&&req.query?.ids){
        const ids=String(req.query.ids).split(',');if(ids.length>24)throw new AuthError('Compare up to 24 saved runs.',400);
        const selected=ids.map(id=>records.find(r=>r.id===id));if(selected.some(r=>!r))throw new AuthError('A selected run is unavailable.',404);
        return res.status(200).json({comparison:selected.map(summary),csv:comparisonCsv(selected)});
      }
      if(req.query?.id){
        const record=records.find(r=>r.id===req.query.id);if(!record)throw new AuthError('Record not found.',404);
        if(kind==='runs'&&req.query.section==='summary')return res.status(200).json({summary:summary(record),csv:tradesCsv(record)});
        if(kind==='runs'&&req.query.section==='trades'){
          const offset=Math.max(0,Math.floor(Number(req.query.offset)||0)),limit=Math.min(500,Math.max(1,Math.floor(Number(req.query.limit)||50)));
          return res.status(200).json({trades:record.trades.slice(offset,offset+limit),total:record.trades.length,nextOffset:offset+limit<record.trades.length?offset+limit:null,settings:record.settings,strategySource:record.strategySource});
        }
        if(kind==='datasets'){
          const first=record.bars[0],last=record.bars.at(-1),seconds=record.bars.length>1?record.bars[1].time-first.time:60;
          const start=req.query.start?Number(req.query.start):first.time,end=req.query.end?Number(req.query.end):last.time;
          if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||start<first.time||end>last.time+seconds||req.query.granularity&&Number(req.query.granularity)!==seconds)throw new AuthError('This dataset does not cover the requested dates or timeframe.',400);
          return res.status(200).json({dataset:{...record,bars:record.bars.filter(b=>b.time>=start&&b.time<=end)}});
        }
        return res.status(200).json({record});
      }
      return res.status(200).json({records,...(kind==='preferences'?{defaults:{id:'defaults',timezone:'UTC',capital:10000,riskPct:0,spreadBps:0,feeMode:'percentage',feePerTrade:1,feeBps:2,slippageBps:1,splitPct:70}}:{})});
    }
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||JSON.stringify(body).length>3_500_000)return res.status(413).json({error:'Workspace record is too large. Import a smaller dataset.'});
    if(req.method==='DELETE'){await deleteRecord(sql,user.id,body.kind,body.id);return res.status(200).json({ok:true});}
    return res.status(200).json({record:await putRecord(sql,user.id,body.kind,body.record,body.expectedRevision)});
  }catch(e){return authFailure(res,e);}
};}
export default createWorkspaceHandler();
