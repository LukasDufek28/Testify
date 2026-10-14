import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Maximize2,Minimize2,Send,X,Plus} from 'lucide-react';
import {motion} from 'motion/react';
import type {ModelMessage} from 'ai';
import type {ApiFetch} from './api-client';
import {CardTitle,DesignCard,designIcons} from './PenpotPrimitives';
import './assistant.css';

export type AssistantAction={id:string;name:string;input:Record<string,unknown>};
type Message={role:'user'|'assistant';text:string};
type Configuration={userId:string;apiFetch:ApiFetch;context:unknown;execute:(action:AssistantAction)=>Promise<unknown>};
const activity:Record<string,string>={update_settings:'Updating run settings…',run_backtest:'Running your backtest…',create_strategy:'Creating your strategy…',revise_strategy:'Preparing a strategy revision…',open_page:'Opening the page…'};
export function useAssistantController(configuration:Configuration){
  const current=useRef(configuration);current.current=configuration;
  const [open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [messages,setMessages]=useState<Message[]>(()=>{try{const list=JSON.parse(localStorage.getItem(`testify-assistant-v1:${configuration.userId}`)||'[]');return Array.isArray(list)?list.filter(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-30):[];}catch{return [];}});
  const locked=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{try{localStorage.setItem(`testify-assistant-v1:${configuration.userId}`,JSON.stringify(messages.slice(-30)));}catch{/* Chat remains available in this session. */}},[messages,configuration.userId]);
  async function send(prompt:string){
    if(locked.current||!prompt.trim())return;locked.current=true;setOpen(true);setError('');setStatus('Reading your workspace…');
    const thread=[...messages,{role:'user' as const,text:prompt.trim()}].slice(-20);setMessages(thread);
    let modelMessages:ModelMessage[]=thread.map(m=>({role:m.role,content:m.text}));
    try{
      for(let step=0;step<8;step++){
        const response=await current.current.apiFetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:modelMessages,context:current.current.context})});
        const body=await response.json();if(!response.ok)throw new Error(body.error||'The assistant is unavailable. Try again.');
        if(!alive.current)return;
        if(body.answer?.trim())setMessages(previous=>[...previous,{role:'assistant' as const,text:body.answer.trim()}].slice(-30));
        const actions=body.actions as AssistantAction[];
        if(!actions?.length){if(!body.answer?.trim())throw new Error('Gemini returned no answer. Please try again.');return;}
        if(actions.length>4)throw new Error('Please split that request into fewer actions.');
        modelMessages=[...modelMessages,...body.messages];
        for(const action of actions){
          if(!activity[action.name])throw new Error('The assistant requested an unsupported action.');
          setStatus(activity[action.name]);
          let output:unknown;
          try{output=await current.current.execute(action);}catch(e){output={success:false,error:e instanceof Error?e.message:'The action failed.'};}
          if(!alive.current)return;
          modelMessages.push({role:'tool',content:[{type:'tool-result',toolCallId:action.id,toolName:action.name,output:{type:'json',value:JSON.parse(JSON.stringify(output??null))}}]});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        setStatus('Summarizing the result…');
      }
      throw new Error('That request needs more steps. Send a follow-up to continue.');
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'The assistant could not finish.');}
    finally{locked.current=false;if(alive.current)setStatus('');}
  }
  return {open,setOpen,expanded,setExpanded,messages,status,error,send,clear:()=>{if(!locked.current){setMessages([]);setError('');}}};
}
type Controller=ReturnType<typeof useAssistantController>;
const AssistantContext=createContext<Controller|null>(null);
export function useAssistantContext(){const context=useContext(AssistantContext);if(!context)throw new Error('Assistant context is missing.');return context;}
export function AssistantProvider({controller,children}:{controller:Controller;children:ReactNode}){return <AssistantContext.Provider value={controller}>{children}<AssistantOverlay/></AssistantContext.Provider>;}
export function AssistantLauncher(){const a=useAssistantContext();return <button className="design-ai-launcher" aria-label="Open AI assistant" onClick={()=>a.setOpen(!a.open)}><img src="/design/ai-wall.svg" alt=""/></button>;}
export function AssistantCard(){const a=useAssistantContext();const [prompt,setPrompt]=useState('');return <DesignCard className="design-assistant assistant-entry"><CardTitle icon={designIcons.assistant}>AI assistant</CardTitle><h2>What can I<br/>help you with?</h2><div className="assistant-suggestions">{['Review my strategy','Explain drawdown'].map(text=><button key={text} onClick={()=>void a.send(text)}>{text}</button>)}</div><form onSubmit={e=>{e.preventDefault();if(prompt.trim()){void a.send(prompt);setPrompt('');}}}><input aria-label="Ask the AI assistant" placeholder="Ask anything…" value={prompt} onChange={e=>setPrompt(e.target.value)}/><button aria-label="Send message" disabled={!!a.status||!prompt.trim()}><Send size={17}/></button></form></DesignCard>;}
function AssistantOverlay(){
  const a=useAssistantContext();const [prompt,setPrompt]=useState(''),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  const root=useRef<HTMLDivElement>(null),thread=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),restore=useRef<HTMLElement|null>(null);
  const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const clamp=(left:number,top:number)=>{const r=root.current?.getBoundingClientRect();return {left:Math.max(12,Math.min(left,innerWidth-(r?.width??290)-12)),top:Math.max(12,Math.min(top,innerHeight-(r?.height??343)-12))};};
  useEffect(()=>{if(!a.open)return;restore.current=document.activeElement as HTMLElement;const raf=requestAnimationFrame(()=>input.current?.focus());const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){a.setOpen(false);restore.current?.focus();}};addEventListener('keydown',escape);return()=>{cancelAnimationFrame(raf);removeEventListener('keydown',escape);};},[a.open]);
  useEffect(()=>{if(!a.open)return;thread.current?.scrollTo({top:thread.current.scrollHeight});},[a.messages,a.status,a.error,a.open]);
  useEffect(()=>{const resize=()=>setPosition(p=>p?clamp(p.left,p.top):p);addEventListener('resize',resize);return()=>removeEventListener('resize',resize);},[]);
  useEffect(()=>{if(position)requestAnimationFrame(()=>setPosition(p=>p?clamp(p.left,p.top):p));},[a.expanded]);
  if(!a.open)return null;
  const submit=()=>{if(prompt.trim()&&!a.status){void a.send(prompt);setPrompt('');}};
  return createPortal(<div ref={root} className={`testify-assistant-layer${a.expanded?' is-expanded':''}`} style={position?{left:position.left,top:position.top,bottom:'auto'}:undefined} role="dialog" aria-label="AI assistant">
    <motion.section initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.16}} className="design-card design-assistant floating assistant-chat">
      <header onPointerDown={e=>{if((e.target as Element).closest('button'))return;const r=root.current!.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,left:r.left,top:r.top};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(d)setPosition(clamp(d.left+e.clientX-d.x,d.top+e.clientY-d.y));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
        <CardTitle icon={designIcons.assistant}>AI assistant</CardTitle><div className="assistant-header-actions"><button type="button" aria-label="New conversation" disabled={!!a.status} onClick={a.clear}><Plus size={14}/></button><button type="button" aria-label={a.expanded?'Minimize assistant':'Expand assistant'} onClick={()=>a.setExpanded(!a.expanded)}>{a.expanded?<Minimize2 size={13}/>:<Maximize2 size={13}/>}</button><button type="button" aria-label="Close assistant" onClick={()=>{a.setOpen(false);restore.current?.focus();}}><X size={14}/></button></div>
      </header>
      <div ref={thread} className="assistant-thread" role="log" aria-label="Conversation history" aria-live="polite">
        {!a.messages.length?<div className="assistant-welcome"><h2>What can I<br/>help you with?</h2><div className="assistant-suggestions">{['Review my strategy','Explain drawdown'].map(text=><button key={text} onClick={()=>void a.send(text)}>{text}</button>)}</div></div>:a.messages.map((m,i)=><div key={i} className={`assistant-message ${m.role}`}><span className="sr-only">{m.role==='user'?'You':'AI assistant'}: </span>{m.text}</div>)}
        {a.status&&<p className="assistant-activity" role="status"><span aria-hidden="true"/>{a.status}</p>}
        {a.error&&<div className="assistant-chat-error" role="alert">{a.error}<button type="button" onClick={()=>{const last=[...a.messages].reverse().find(m=>m.role==='user');if(last)void a.send(last.text);}}>Try again</button></div>}
      </div>
      <form onSubmit={e=>{e.preventDefault();submit();}}><textarea ref={input} rows={1} aria-label="Message AI assistant" placeholder={a.messages.length?'Ask a follow-up…':'Ask anything…'} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/><button aria-label="Send assistant message" disabled={!!a.status||!prompt.trim()}><Send size={17}/></button></form>
    </motion.section>
  </div>,document.body);
}
