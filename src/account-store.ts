import {createLocalStore} from './storage';
import type {ApiFetch} from './api-client';
import type {Dataset,Run} from './types';
export function createAccountStore(userId:string,apiFetch:ApiFetch){
  const local=createLocalStore(userId);
  async function request(kind:string,method='GET',record?:unknown,id?:string){
    const response=await apiFetch(`/api/workspace${method==='GET'?`?kind=${kind}`:''}`,{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,record,id})})});
    const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not sync your saved workspace.');return body;
  }
  async function read<T extends Dataset|Run>(kind:'datasets'|'runs'):Promise<T[]>{
    const cached=await local[kind]();
    const {records}=await request(kind);
    const migration=`testify-account-migrated:${userId}:${kind}`;
    if(localStorage.getItem(migration)!=='true'){
      for(const item of cached)if(!records.some((r:{id:string})=>r.id===item.id)){const migrated=kind==='runs'?{...item,strategySource:(item as Run).strategySource??''}:item;await request(kind,'POST',migrated);records.push(migrated);}
      localStorage.setItem(migration,'true');
    }
    for(const item of records)if(kind==='datasets')await local.putDataset(item);else await local.putRun(item);
    for(const item of cached)if(!records.some((r:{id:string})=>r.id===item.id)){if(kind==='datasets')await local.deleteDataset(item.id);else await local.deleteRun(item.id);}
    return records as T[];
  }
  return {...local,
    datasets:()=>read<Dataset>('datasets'),runs:()=>read<Run>('runs'),
    putDataset:async(dataset:Dataset)=>{await request('datasets','POST',dataset);await local.putDataset(dataset);},
    putRun:async(run:Run)=>{await request('runs','POST',run);await local.putRun(run);},
    deleteDataset:async(id:string)=>{await request('datasets','DELETE',undefined,id);await local.deleteDataset(id);},
    deleteRun:async(id:string)=>{await request('runs','DELETE',undefined,id);await local.deleteRun(id);},
    clearRuns:async()=>{for(const run of await read<Run>('runs'))await request('runs','DELETE',undefined,run.id);await local.clearRuns();},
  };
}
