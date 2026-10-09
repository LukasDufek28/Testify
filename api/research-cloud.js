import { database,requireUser,authFailure,AuthError } from "../lib/auth.js";
import { listRunSummaries,getRunSummary } from "../lib/mcp/store.js";
import { cancelJob } from "../lib/mcp/jobs.js";
import { digestSource } from "../lib/mcp/summaries.js";
export function createCloudHandler(connect=database,authorize=requireUser){
 return async(req,res)=>{
  if(!["GET","POST"].includes(req.method))return res.status(405).json({error:"Method not allowed."});
  const user=await authorize(req,res,"research-cloud",90);if(!user)return;
  try{
   const sql=connect();
   if(req.method==="GET"){
    const offset=Math.max(0,Math.floor(Number(req.query?.offset)||0)),page=await listRunSummaries(sql,user.id,{limit:100,offset});
    const runs=[];let bytes=0;
    for(const r of page){const size=Buffer.byteLength(JSON.stringify(r));if(runs.length&&bytes+size>2000000)break;runs.push(r);bytes+=size;}
    return res.status(200).json({runs,nextOffset:runs.length<page.length||page.length===100?offset+runs.length:null});
   }
   const b=typeof req.body==="string"?JSON.parse(req.body):req.body;
   if(!b||JSON.stringify(b).length>500000)throw new AuthError("Summary request is too large.",413);
   if(b.action==="cancel")return res.status(200).json(await cancelJob(sql,user.id,b.id));
   if(b.action==="rename"){
    const run=await getRunSummary(sql,user.id,b.id),name=String(b.name||"").trim();if(!name||name.length>100)throw new AuthError("Enter a run name up to 100 characters.",400);
    run.name=name;await sql`UPDATE testify_run_summaries SET payload=${JSON.stringify(run)}::jsonb,updated_at=now() WHERE user_id=${user.id} AND id=${run.id}`;return res.status(200).json({run});
   }
   if(b.action==="delete"){await sql`DELETE FROM testify_run_summaries WHERE user_id=${user.id} AND id=${String(b.id)}`;return res.status(200).json({deleted:b.id});}
   if(b.action==="delete_all"){await sql`DELETE FROM testify_run_summaries WHERE user_id=${user.id}`;return res.status(200).json({ok:true});}
   if(b.action!=="upload"||!Array.isArray(b.runs)||b.runs.length>10)throw new AuthError("Upload up to ten summaries per request.",400);
   for(const run of b.runs){
    if(!run || !/^[A-Za-z0-9_-]{1,128}$/.test(run.id || "") || typeof run.name!=="string" || run.name.length>100 || !run.settings || !Number.isFinite(run.settings.capital) || run.settings.capital<=0 || !run.metrics || !Number.isFinite(run.metrics.netReturnPct) || !Number.isFinite(run.metrics.maxDrawdownPct) || !Number.isInteger(run.metrics.tradeCount) || run.metrics.tradeCount<0 || !Array.isArray(run.curve) || run.curve.length>20000 || run.curve.some((p,i)=>!Number.isFinite(p.time)||!Number.isFinite(p.equity)||(i>0&&p.time<=run.curve[i-1].time)))throw new AuthError("Invalid run summary.",400);
    if(run.research?.phase==="holdout")throw new AuthError("Holdout summaries cannot be imported through development upload.",400);
    const numbers=(object,fields)=>Object.fromEntries(fields.filter(k=>object?.[k]===null||Number.isFinite(object?.[k])).map(k=>[k,object[k]]));
    const settings=numbers(run.settings,["capital","feeBps","feePerTrade","slippageBps","start","end","warmupStart"]);
    const research=run.research?{...numbers(run.research,["fullStart","fullEnd","boundary","holdoutStart","splitPct"]),phase:["development","validation"].includes(run.research.phase)?run.research.phase:"unclassified",parentRunId:typeof run.research.parentRunId==="string"?run.research.parentRunId.slice(0,128):undefined}:undefined;
    const aggregate={...numbers(run.aggregate,["wins","profit","loss","rTotal","rCount"]),exitReasons:Object.fromEntries(Object.entries(run.aggregate?.exitReasons||{}).slice(0,20).filter(([,v])=>Number.isFinite(v)).map(([k,v])=>[k.slice(0,100),v]))};
    const safe={id:run.id,name:run.name,createdAt:Number.isFinite(run.createdAt)?run.createdAt:Date.now(),symbol:String(run.symbol||"").slice(0,40),granularity:run.granularity,strategyId:String(run.strategyId||"").slice(0,128),strategyName:String(run.strategyName||"").slice(0,100),strategySource:typeof run.strategySource==="string"?run.strategySource.slice(0,100000):undefined,settings,research,metrics:numbers(run.metrics,["netReturnPct","maxDrawdownPct","sharpe","winRatePct","tradeCount","totalFees","profitFactor","averageRMultiple","totalFunding"]),aggregate,curve:run.curve.map(p=>({time:p.time,equity:p.equity})),warnings:Array.isArray(run.warnings)?run.warnings.slice(0,30).map(w=>String(w).slice(0,300)):[],summaryOnly:true,curveResolution:"daily",tradeLogs:"not_stored",sourceHash:digestSource(typeof run.strategySource==="string"?run.strategySource:""),origin:"browser_import"};
    await sql`INSERT INTO testify_run_summaries(user_id,id,payload) VALUES (${user.id},${safe.id},${JSON.stringify(safe)}::jsonb) ON CONFLICT(user_id,id) DO NOTHING`;
   }
   return res.status(200).json({uploaded:b.runs.length});
  }catch(e){return authFailure(res,e);}
 };
}
export default createCloudHandler();
