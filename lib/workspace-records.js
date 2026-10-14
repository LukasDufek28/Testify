import {AuthError} from './auth.js';
const kinds=new Set(['datasets','runs','replays','jobs','preferences']);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export async function ensureWorkspaceSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS testify_workspace_records (user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE, kind text NOT NULL, id text NOT NULL, payload jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,kind,id))`;
  await sql`CREATE TABLE IF NOT EXISTS testify_mcp_mutations (user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE, key text NOT NULL, fingerprint text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key))`;
}
export function validateRecord(kind,value){
  if(!kinds.has(kind))throw new AuthError('Unknown workspace record type.',400);
  if(!value||typeof value!=='object'||typeof value.id!=='string'||!value.id||value.id.length>128)throw new AuthError('Invalid workspace record.',400);
  if(kind==='datasets'&&(!Array.isArray(value.bars)||!value.bars.length||value.bars.length>20000||typeof value.symbol!=='string'||value.bars.some((b,i)=>!b||!['time','open','high','low','close','volume'].every(k=>Number.isFinite(b[k]))||b.time<0||b.low<=0||b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.volume<0||(i&&b.time<=value.bars[i-1].time))))throw new AuthError('Dataset must contain up to 20,000 valid, ordered, unique candles.',400);
  if(kind==='runs'&&(!Array.isArray(value.curve)||!Array.isArray(value.trades)||!value.settings||!value.metrics||!Number.isFinite(value.metrics.netReturnPct)||typeof value.strategySource!=='string'))throw new AuthError('A complete backtest snapshot is required.',400);
  if(kind==='preferences'){
    const allowed=new Set(['id','timezone','feeMode','feePerTrade','capital','riskPct','spreadBps','feeBps','slippageBps','splitPct']);
    if(value.id!=='defaults'||Object.keys(value).some(k=>!allowed.has(k)))throw new AuthError('Unsupported preference.',400);
    try{new Intl.DateTimeFormat('en',{timeZone:value.timezone}).format();}catch{throw new AuthError('Choose a valid timezone.',400);}
    for(const key of ['capital','feeBps','slippageBps','splitPct'])if(!Number.isFinite(value[key]))throw new AuthError('Preferences must be finite numbers.',400);
    if(value.feeMode!==undefined&&!['fixed','percentage'].includes(value.feeMode))throw new AuthError('Invalid fee mode.',400);
    if(value.feePerTrade!==undefined&&(!Number.isFinite(value.feePerTrade)||value.feePerTrade<0||value.feePerTrade>1e9))throw new AuthError('Invalid fixed fee.',400);
    if(value.riskPct!==undefined&&(!Number.isFinite(value.riskPct)||value.riskPct<0||value.riskPct>10))throw new AuthError('Risk must be between 0 and 10%.',400);
    if(value.spreadBps!==undefined&&(!Number.isFinite(value.spreadBps)||value.spreadBps<0||value.spreadBps>1000))throw new AuthError('Invalid spread.',400);
    if(value.capital<=0||value.capital>1e9||value.feeBps<0||value.feeBps>1000||value.slippageBps<0||value.slippageBps>1000||value.splitPct<30||value.splitPct>80)throw new AuthError('Default settings are outside supported ranges.',400);
  }
  return value;
}
export async function listRecords(sql,userId,kind){if(!kinds.has(kind))throw new AuthError('Unknown workspace record type.',400);const rows=await sql`SELECT payload FROM testify_workspace_records WHERE user_id=${userId} AND kind=${kind} ORDER BY updated_at DESC`;return rows.map(r=>r.payload);}
export async function putRecord(sql,userId,kind,value,expectedRevision){
  validateRecord(kind,value);
  if(kind==='runs'||kind==='datasets'){
    const [inserted]=await sql`INSERT INTO testify_workspace_records(user_id,kind,id,payload) VALUES(${userId},${kind},${value.id},${JSON.stringify(value)}::jsonb) ON CONFLICT DO NOTHING RETURNING payload`;
    if(inserted)return inserted.payload;
    const [existing]=await sql`SELECT payload FROM testify_workspace_records WHERE user_id=${userId} AND kind=${kind} AND id=${value.id}`;
    if(!existing)throw new AuthError('This record changed. Reload before saving.',409);
    if(kind==='datasets'){if(canonical(existing.payload)!==canonical(value))throw new AuthError('Saved dataset snapshots are immutable. Import a new dataset instead.',409);return existing.payload;}
    const {name:oldName,...original}=existing.payload,{name:newName,...updated}=value;
    if(canonical(original)!==canonical(updated))throw new AuthError('Saved backtest snapshots are immutable.',409);
    if(oldName===newName)return existing.payload;
    const [renamed]=await sql`UPDATE testify_workspace_records SET payload=jsonb_set(payload,'{name}',${JSON.stringify(newName)}::jsonb),revision=revision+1,updated_at=now() WHERE user_id=${userId} AND kind='runs' AND id=${value.id} AND payload-'name'=${JSON.stringify(original)}::jsonb RETURNING payload`;
    if(!renamed)throw new AuthError('This record changed. Reload before saving.',409);return renamed.payload;
  }
  if(expectedRevision!==undefined){const rows=expectedRevision===0?await sql`INSERT INTO testify_workspace_records(user_id,kind,id,payload) VALUES(${userId},${kind},${value.id},${JSON.stringify(value)}::jsonb) ON CONFLICT DO NOTHING RETURNING payload,revision`:await sql`UPDATE testify_workspace_records SET payload=${JSON.stringify(value)}::jsonb,revision=revision+1,updated_at=now() WHERE user_id=${userId} AND kind=${kind} AND id=${value.id} AND revision=${expectedRevision} RETURNING payload,revision`;const [row]=rows;if(!row)throw new AuthError('This record changed. Reload before saving.',409);return {...row.payload,_revision:row.revision};}
  const [row]=await sql`INSERT INTO testify_workspace_records(user_id,kind,id,payload) VALUES(${userId},${kind},${value.id},${JSON.stringify(value)}::jsonb) ON CONFLICT(user_id,kind,id) DO UPDATE SET payload=EXCLUDED.payload,revision=testify_workspace_records.revision+1,updated_at=now() RETURNING payload`;
  return row.payload;
}
export async function deleteRecord(sql,userId,kind,id){if(!kinds.has(kind)||typeof id!=='string')throw new AuthError('Invalid record.',400);await sql`DELETE FROM testify_workspace_records WHERE user_id=${userId} AND kind=${kind} AND id=${id}`;}
