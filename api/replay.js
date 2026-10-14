import {database,requireUser,checkOrigin,authFailure,AuthError} from '../lib/auth.js';
import {ensureWorkspaceSchema,listRecords,putRecord} from '../lib/workspace-records.js';
import {getStrategy} from '../lib/services/strategies.js';
import {idempotent} from '../lib/mcp/store.js';
import {createManualSession,advanceManual,replayBars,manualResult,manualOrderPreview} from '../lib/shared/manual-engine.js';
export function createReplayHandler(authorize=requireUser,connect=database){return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
  const user=await authorize(req,res,'replay',240);if(!user)return;
  try{const sql=connect();await ensureWorkspaceSchema(sql);const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const sessions=await listRecords(sql,user.id,'replays');let state;
    if(req.method==='GET'){state=req.query?.id?sessions.find(s=>s.id===req.query.id):sessions.find(s=>s.status==='paused')||sessions[0];if(req.query?.id&&!state)throw new AuthError('Replay not found.',404);}
    else{
      checkOrigin(req);if(!body||JSON.stringify(body).length>8000||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,60}$/.test(body.requestId))throw new AuthError('Invalid replay request.',400);
      const result=await idempotent(sql,user.id,'replay_'+body.requestId,body,async()=>{
        if(body.action==='start'){
          const dataset=(await listRecords(sql,user.id,'datasets')).find(d=>d.id===body.datasetId);if(!dataset)throw new AuthError('Import or load a dataset first.',400);
          const strategy=await getStrategy(sql,user.id,body.strategyId);const initial=createManualSession(dataset,strategy,body.settings,String(body.name||'Manual replay').slice(0,100));return putRecord(sql,user.id,'replays',initial,0);
        }
        if(!Number.isInteger(body.expectedRevision)||body.expectedRevision<1)throw new AuthError('Expected replay revision is required.',400);
        const current=sessions.find(s=>s.id===body.id);if(!current)throw new AuthError('Replay not found.',404);
        const dataset=(await listRecords(sql,user.id,'datasets')).find(d=>d.id===current.datasetId);if(!dataset)throw new AuthError('The saved replay dataset is unavailable.',409);
        const next=advanceManual(current,dataset,body.command);
        if(next.status==='completed'){
          const run=manualResult(next,dataset);
          const [changed]=await sql`WITH changed AS (UPDATE testify_workspace_records SET payload=${JSON.stringify(next)}::jsonb,revision=revision+1,updated_at=now() WHERE user_id=${user.id} AND kind='replays' AND id=${next.id} AND revision=${body.expectedRevision} RETURNING payload,revision), saved AS (INSERT INTO testify_workspace_records(user_id,kind,id,payload) SELECT ${user.id},'runs',${run.id},${JSON.stringify(run)}::jsonb FROM changed ON CONFLICT DO NOTHING) SELECT * FROM changed`;
          if(!changed)throw new AuthError('This replay changed. Reload before continuing.',409);
          return {...changed.payload,_revision:changed.revision};
        }
        return putRecord(sql,user.id,'replays',next,body.expectedRevision);
      });state=result;
    }
    if(!state)return res.status(200).json({session:null});
    const dataset=(await listRecords(sql,user.id,'datasets')).find(d=>d.id===state.datasetId);if(!dataset)throw new AuthError('Replay dataset unavailable.',409);
    const [revision]=await sql`SELECT payload,revision FROM testify_workspace_records WHERE user_id=${user.id} AND kind='replays' AND id=${state.id}`;
    state=revision.payload;const bars=replayBars(dataset,state.settings);return res.status(200).json({session:{...state,_revision:revision.revision},bars:bars.slice(0,state.cursor+1),totalBars:bars.length,symbol:dataset.symbol,orderPreview:manualOrderPreview(state,dataset)});
  }catch(error){return authFailure(res,error);}
}

}
export default createReplayHandler();
