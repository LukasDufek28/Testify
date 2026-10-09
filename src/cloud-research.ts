import type { Run } from "./types";
import type { ApiFetch } from "./api-client";
export function browserSummary(run: Run) {
  const daily = new Map<number, Run["curve"][number]>();
  for (const point of run.curve) daily.set(Math.floor(point.time / 86400), point);
  const points = [run.curve[0], ...daily.values(), run.curve.at(-1)].filter((p): p is Run["curve"][number] => !!p);
  let wins=0,profit=0,loss=0,rTotal=0,rCount=0;
  const exitReasons:Record<string,number>={};
  for (const t of run.trades) {if(t.pnl>0){wins++;profit+=t.pnl;}else loss-=t.pnl;if(Number.isFinite(t.rMultiple)){rTotal+=t.rMultiple!;rCount++;}exitReasons[t.reason]=(exitReasons[t.reason]||0)+1;}
  return {...run,trades:[],curve:[...new Map(points.map(p=>[p.time,p])).values()].sort((a,b)=>a.time-b.time),summaryOnly:true,aggregate:{wins,profit,loss,rTotal,rCount,exitReasons}};
}
export async function cloudRequest(apiFetch:ApiFetch,body?:unknown,offset=0) {
  const response=await apiFetch(`/api/research-cloud?offset=${offset}`,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:undefined);
  const result=await response.json();if(!response.ok)throw new Error(result.error || "Cloud history unavailable.");return result;
}
export async function loadCloudRuns(apiFetch:ApiFetch):Promise<Run[]> {
  const runs:Run[]=[];
  for(let offset=0;;){const result=await cloudRequest(apiFetch,undefined,offset);runs.push(...result.runs as Run[]);if(result.nextOffset===null)return runs;offset=result.nextOffset;}
}
export function mergeCloudRuns(local:Run[],cloud:Run[]):Run[] {
  const combined=new Map(local.map(r=>[r.id,r]));
  for(const remote of cloud){const existing=combined.get(remote.id);combined.set(remote.id,existing?{...existing,name:remote.name,cloudLinked:true}:{...remote,trades:[],summaryOnly:true,cloudLinked:true});}
  return [...combined.values()].sort((a,b)=>b.createdAt-a.createdAt);
}
