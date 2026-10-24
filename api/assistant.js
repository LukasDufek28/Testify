import { requireUser } from '../lib/auth.js';
import { answerAssistant } from '../lib/assistant-agent.js';

export function createAssistantHandler(authorize=requireUser,answer=answerAssistant) {
  return async (req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
    const user=await authorize(req,res,'assistant',30);if(!user)return;
    const origin=req.headers.origin;
    if(origin){try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Requests must come from Testify.'});}catch{return res.status(403).json({error:'Invalid origin.'});}}
    let body=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({error:'Invalid JSON.'});}
    if(!body||JSON.stringify(body).length>180000)return res.status(413).json({error:'Conversation is too large. Start a new chat.'});
    if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>40||body.messages.some(m=>!m||!['user','assistant','tool'].includes(m.role)||(!Array.isArray(m.content)&&typeof m.content!=='string')))return res.status(400).json({error:'Invalid conversation.'});
    if(!body.context||typeof body.context!=='object'||Array.isArray(body.context))return res.status(400).json({error:'Workspace context is missing.'});
    if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'Gemini is not configured. Add the server API key to enable the assistant.'});
    const streaming=String(req.headers.accept||'').includes('text/event-stream');
    const emit=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if(streaming){res.status(200);res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('X-Accel-Buffering','no');res.flushHeaders?.();}
    try{
      const result=await answer({messages:body.messages,context:body.context,apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.6-flash',onActivity:streaming?text=>emit('activity',{text}):undefined});
      if(streaming){emit('result',result);return res.end();}
      return res.status(200).json(result);
    }catch(error){
      const status=error.statusCode??error.cause?.statusCode;
      const failure={error:status===429?'Gemini is busy or its quota is reached. Try again in a minute.':'Gemini could not finish that reply. Try again to continue; completed changes are kept.'};
      if(streaming){emit('error',failure);return res.end();}
      if(status===429)res.setHeader('Retry-After','60');
      return res.status(status===429?429:503).json(failure);
    }
  };
}
export default createAssistantHandler();
