import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Maximize2,Minimize2,Send,X,Plus} from 'lucide-react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import type {ModelMessage} from 'ai';
import type {ApiFetch} from './api-client';
import Markdown from 'react-markdown';
import {CardTitle,designIcons} from './PenpotPrimitives';
import './assistant.css';

export type AssistantAction={id:string;name:string;input:Record<string,unknown>};
type Message={role:'user'|'assistant';text:string};
type Configuration={userId:string;apiFetch:ApiFetch;context:unknown;execute:(action:AssistantAction)=>Promise<unknown>};
const activity:Record<string,string>={update_settings:'Updating run settings…',run_backtest:'Running your backtest…',create_strategy:'Creating your strategy…',revise_strategy:'Preparing a strategy revision…',open_page:'Opening the page…'};
export function useAssistantController(configuration:Configuration){
  const current=useRef(configuration);current.current=configuration;
  const [open,setOpenState]=useState(false),[closing,setClosing]=useState(false),[expanded,setExpanded]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const anchor=useRef<HTMLDivElement>(null);
  const [origin,setOrigin]=useState({left:12,top:Math.max(12,innerHeight-120),width:222,height:106});
  function setOpen(value:boolean){
    if(value){const rect=anchor.current?.getBoundingClientRect();if(rect&&rect.width>0)setOrigin({left:rect.left,top:rect.top,width:rect.width,height:rect.height});setClosing(false);}else if(open)setClosing(true);
    setOpenState(value);
  }
  const [messages,setMessages]=useState<Message[]>(()=>{try{const list=JSON.parse(localStorage.getItem(`testify-assistant-v1:${configuration.userId}`)||'[]');return Array.isArray(list)?list.filter(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-30):[];}catch{return [];}});
  const locked=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{try{localStorage.setItem(`testify-assistant-v1:${configuration.userId}`,JSON.stringify(messages.slice(-30)));}catch{/* Chat remains available in this session. */}},[messages,configuration.userId]);
  async function send(prompt:string,retry=false){
    if(locked.current||!prompt.trim())return;locked.current=true;setOpen(true);setError('');setStatus('Reading your workspace…');
    const thread=(retry&&messages.at(-1)?.role==='user'&&messages.at(-1)?.text===prompt.trim()?messages:[...messages,{role:'user' as const,text:prompt.trim()}]).slice(-20);setMessages(thread);
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
  return {open,setOpen,closing,finishClose:()=>setClosing(false),anchor,origin,expanded,setExpanded,messages,status,error,send,clear:()=>{if(!locked.current){setMessages([]);setError('');}}};
}
type Controller=ReturnType<typeof useAssistantController>;
const AssistantContext=createContext<Controller|null>(null);
export function useAssistantContext(){const context=useContext(AssistantContext);if(!context)throw new Error('Assistant context is missing.');return context;}
export function AssistantProvider({controller,children}:{controller:Controller;children:ReactNode}){return <AssistantContext.Provider value={controller}>{children}<AssistantOverlay/></AssistantContext.Provider>;}
export function AssistantLauncher(){const a=useAssistantContext();const reduced=useReducedMotion();return <div ref={a.anchor} className="assistant-launcher-slot">{!a.open&&!a.closing&&<motion.button className="design-ai-launcher" style={{borderRadius:24}} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?0:.12}} aria-label="Open AI assistant" onClick={()=>a.setOpen(true)}><img src="/design/ai-wall.svg" alt=""/></motion.button>}</div>;}
function AssistantOverlay(){
  const reduced=useReducedMotion();
  const a=useAssistantContext();const [prompt,setPrompt]=useState(''),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  const [viewport,setViewport]=useState({width:innerWidth,height:innerHeight});
  const root=useRef<HTMLDivElement>(null),thread=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),restore=useRef<HTMLElement|null>(null);
  const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const clamp=(left:number,top:number)=>{const r=root.current?.getBoundingClientRect();return {left:Math.max(12,Math.min(left,innerWidth-(r?.width??290)-12)),top:Math.max(12,Math.min(top,innerHeight-(r?.height??343)-12))};};
  useEffect(()=>{if(!a.open)return;restore.current=document.activeElement as HTMLElement;const raf=requestAnimationFrame(()=>input.current?.focus());const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')a.setOpen(false);};addEventListener('keydown',escape);return()=>{cancelAnimationFrame(raf);removeEventListener('keydown',escape);};},[a.open]);
  useEffect(()=>{if(!a.open)return;thread.current?.scrollTo({top:thread.current.scrollHeight});},[a.messages,a.status,a.error,a.open]);
  useEffect(()=>{if(a.open||a.closing||!restore.current)return;const previous=restore.current;const launcher=document.querySelector<HTMLButtonElement>('.design-ai-launcher');if(previous!==document.body&&previous.isConnected)previous.focus();else if(launcher?.getClientRects().length)launcher.focus();else document.querySelector<HTMLButtonElement>('.design-mobile-menu')?.focus();},[a.open,a.closing]);
  useEffect(()=>{const resize=()=>{setViewport({width:innerWidth,height:innerHeight});setPosition(p=>p?clamp(p.left,p.top):p);};addEventListener('resize',resize);return()=>removeEventListener('resize',resize);},[]);
  useEffect(()=>{if(position)requestAnimationFrame(()=>setPosition(p=>p?clamp(p.left,p.top):p));},[a.expanded]);
  const submit=()=>{if(prompt.trim()&&!a.status){void a.send(prompt);setPrompt('');}};
  const width=Math.min(a.expanded?480:290,viewport.width-24),height=Math.min(a.expanded?590:343,viewport.height-32);
  const dockLeft=viewport.width>700?a.origin.left+a.origin.width+18:12;
  const destination={width,height,opacity:1,left:Math.max(12,Math.min(position?.left??dockLeft,viewport.width-width-12)),top:Math.max(12,Math.min(position?.top??a.origin.top+a.origin.height-height,viewport.height-height-12))};
  const closedBox={width,height:Math.min(106,height),top:destination.top+height-Math.min(106,height),opacity:0};
  const finishClose=()=>{setPosition(null);a.finishClose();};
  const {left:targetLeft,...openBox}=destination;
  // Grow the surface without scaling the text; CSS keeps it inside resized viewports.
  return createPortal(<AnimatePresence initial={false} onExitComplete={finishClose}>{a.open&&<motion.div key="assistant" ref={root} className={`testify-assistant-layer${a.expanded?' is-expanded':''}`} style={{borderRadius:24,bottom:'auto',left:`clamp(12px, ${targetLeft}px, calc(100vw - ${width}px - 12px))`}} initial={reduced?false:closedBox} animate={openBox} exit={reduced?{opacity:0}:closedBox} transition={reduced?{duration:0}:{type:'spring',bounce:.025,visualDuration:.3,opacity:{duration:.14}}} role="dialog" aria-label="AI assistant">
    <motion.section style={{width,height}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,transition:{duration:reduced?0:.08}}} transition={{duration:reduced?0:.14,delay:reduced?0:.18}} className="design-card design-assistant floating assistant-chat">
      <header onPointerDown={e=>{if((e.target as Element).closest('button'))return;const r=root.current!.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,left:r.left,top:r.top};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(d)setPosition(clamp(d.left+e.clientX-d.x,d.top+e.clientY-d.y));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
        <CardTitle icon={designIcons.assistant}>AI assistant</CardTitle><div className="assistant-header-actions"><button type="button" aria-label="New conversation" disabled={!!a.status} onClick={a.clear}><Plus size={14}/></button><button type="button" aria-label={a.expanded?'Minimize assistant':'Expand assistant'} onClick={()=>a.setExpanded(!a.expanded)}>{a.expanded?<Minimize2 size={13}/>:<Maximize2 size={13}/>}</button><button type="button" aria-label="Close assistant" onClick={()=>{a.setOpen(false);restore.current?.focus();}}><X size={14}/></button></div>
      </header>
      <div ref={thread} className="assistant-thread" role="log" aria-label="Conversation history" aria-live="polite">
        {!a.messages.length?<div className="assistant-welcome"><h2>What can I<br/>help you with?</h2><div className="assistant-suggestions">{['Review my strategy','Explain drawdown'].map(text=><button key={text} onClick={()=>void a.send(text)}>{text}</button>)}</div></div>:a.messages.map((m,i)=><div key={i} className={`assistant-message ${m.role}`} role="article" aria-label={m.role==='user'?'Your message':'Assistant response'}>{m.role==='user'?m.text:<Markdown skipHtml allowedElements={['p','strong','em','ul','ol','li','h1','h2','h3','h4','h5','h6','code','pre','blockquote','br','hr','a']} components={{a:({node:_,...props})=><a {...props} target="_blank" rel="noopener noreferrer"/>}}>{m.text}</Markdown>}</div>)}
        {a.status&&<p className="assistant-activity" role="status"><span aria-hidden="true"/>{a.status}</p>}
        {a.error&&<div className="assistant-chat-error" role="alert">{a.error}<button type="button" onClick={()=>{const last=[...a.messages].reverse().find(m=>m.role==='user');if(last)void a.send(last.text,true);}}>Try again</button></div>}
      </div>
      <form onSubmit={e=>{e.preventDefault();submit();}}><textarea ref={input} rows={1} aria-label="Message AI assistant" placeholder={a.messages.length?'Ask a follow-up…':'Ask anything…'} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/><button aria-label="Send assistant message" disabled={!!a.status||!prompt.trim()}><Send size={17}/></button></form>
    </motion.section>
  </motion.div>}</AnimatePresence>,document.body);
}
