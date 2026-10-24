// Activity summaries travel separately from the final answer. No partial tool
// calls are executed; the controller acts only after a complete result event.
export async function readAssistantReply(response:Response,onActivity:(text:string)=>void):Promise<Record<string,unknown>>{
  if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream')){
    const result=await response.json().catch(()=>{throw new Error('The reply could not be read. Try again to continue.');});
    if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('The assistant returned an invalid reply.');
    if(!response.ok)throw new Error(result.error||'The assistant is unavailable. Try again.');
    return result;
  }
  if(!response.body)throw new Error('The reply was interrupted. Try again to continue.');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',bytes=0;
  try{
    for(;;){
      const {value,done}=await reader.read();
      bytes+=value?.byteLength??0;
      if(bytes>2_000_000)throw new Error('The reply is too large. Ask for a shorter answer.');
      buffer+=decoder.decode(value,{stream:!done});
      let boundary:RegExpExecArray|null;
      while((boundary=/\r?\n\r?\n/.exec(buffer))){
        const frame=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);
        const lines=frame.split(/\r?\n/),event=lines.find(line=>line.startsWith('event:'))?.slice(6).trim();
        const data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!data)continue;
        let payload;
        try{payload=JSON.parse(data);}catch{throw new Error('The reply could not be read. Try again to continue.');}
        if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('The assistant returned an invalid reply.');
        if(event==='activity'&&typeof payload.text==='string')onActivity(payload.text.slice(0,160));
        if(event==='error')throw new Error(payload.error||'The reply was interrupted. Try again.');
        if(event==='result'){
          return payload;
        }
      }
      if(done)throw new Error('The reply was interrupted. Try again to continue.');
    }
  }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
