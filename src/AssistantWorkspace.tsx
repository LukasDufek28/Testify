import {useEffect,useRef,useState,type ReactNode} from 'react';
import {AssistantContext,useAssistantContext} from './assistant-context';
export {useAssistantContext} from './assistant-context';
import {createPortal} from 'react-dom';
import {Maximize2,Minimize2,Send,Square,X,Plus} from 'lucide-react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import type {ModelMessage} from 'ai';
import type {ApiFetch} from './api-client';
import Markdown from 'react-markdown';
import {CardTitle,designIcons} from './PenpotPrimitives';
import './assistant.css';
import {requestMessages,withoutContextReads} from './assistant-conversation';
import {readAssistantReply} from './assistant-transport';

export type AssistantAction={id:string;name:string;input:Record<string,unknown>};
type Message={role:'user'|'assistant';text:string};
type Configuration={userId:string;apiFetch:ApiFetch;context:unknown;execute:(action:AssistantAction)=>Promise<unknown>};
const activity:Record<string,string>={update_settings:'Updating run settings…',run_backtest:'Running your backtest…',create_strategy:'Creating your strategy…',revise_strategy:'Preparing a strategy revision…',open_page:'Opening the page…'};
async function waitForReply<T>(request:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();
  let abort=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});});
  // Some transports keep a pending fetch/body alive after abort. Release the UI
  // independently; a late reply cannot reach the action loop after this race.
  try{return await Promise.race([request(),cancelled]);}
  finally{signal.removeEventListener('abort',abort);}
}
export function useAssistantController(configuration:Configuration){
  const current=useRef(configuration);current.current=configuration;
  const [open,setOpenState]=useState(false),[closing,setClosing]=useState(false),[expanded,setExpanded]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[stopping,setStopping]=useState(false);
  const anchor=useRef<HTMLDivElement>(null);
  const [origin,setOrigin]=useState({left:12,top:Math.max(12,innerHeight-120),width:222,height:106});
  function setOpen(value:boolean){
    if(value){const rect=anchor.current?.getBoundingClientRect();if(rect&&rect.width>0)setOrigin({left:rect.left,top:rect.top,width:rect.width,height:rect.height});setClosing(false);}else if(open)setClosing(true);
    setOpenState(value);
  }
  const [messages,setMessages]=useState<Message[]>(()=>{try{const list=JSON.parse(localStorage.getItem(`testify-assistant-v1:${configuration.userId}`)||'[]');return Array.isArray(list)?list.filter(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-30):[];}catch{return [];}});
  const locked=useRef(false),alive=useRef(true);
  const history=useRef<ModelMessage[][]>([messages.map(m=>({role:m.role,content:m.text}))]);
  const pending=useRef<{prompt:string;messages:ModelMessage[];outputs:Map<string,{input:string;output:unknown}>}|null>(null);
  const operation=useRef<AbortController|null>(null);
  useEffect(()=>{alive.current=true;if(messages.at(-1)?.role==='user')setNotice('The previous reply was interrupted. Send a follow-up to continue; completed changes are kept.');return()=>{alive.current=false;operation.current?.abort();};},[]);
  useEffect(()=>{try{localStorage.setItem(`testify-assistant-v1:${configuration.userId}`,JSON.stringify(messages.slice(-30)));}catch{/* Chat remains available in this session. */}},[messages,configuration.userId]);
  async function send(prompt:string,retry=false){
    if(locked.current||!prompt.trim()||(retry&&!pending.current))return;
    locked.current=true;setOpen(true);setError('');setNotice('');setStopping(false);setStatus(retry?'Resuming your request…':'Preparing a reply…');
    if(!retry){
      // Preserve any completed actions from an interrupted turn in follow-ups.
      if(pending.current)history.current.push(pending.current.messages);
      pending.current={prompt:prompt.trim(),messages:[{role:'user',content:prompt.trim()}],outputs:new Map()};
      setMessages(previous=>[...previous,{role:'user' as const,text:prompt.trim()}].slice(-30));
    }
    const turn=pending.current!;
    const controller=new AbortController();operation.current=controller;
    const complete=()=>{history.current=[...history.current,turn.messages].slice(-8);pending.current=null;};
    try{
      for(let step=0;step<8;step++){
        controller.signal.throwIfAborted();
        const context=current.current.context;
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]);
        const body=await waitForReply(async()=>{
          const response=await current.current.apiFetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},signal,body:JSON.stringify({messages:requestMessages(history.current,turn.messages,context),context})});
          return readAssistantReply(response,text=>{if(alive.current&&!controller.signal.aborted)setStatus(text);});
        },signal);
        if(!alive.current)return;
        controller.signal.throwIfAborted();
        const actions=(Array.isArray(body.actions)?body.actions:[]) as AssistantAction[];
        if(actions.length>4)throw new Error('Please split that request into fewer actions.');
        if(actions.some(action=>!action||typeof action.id!=='string'||!activity[action.name]||!action.input||typeof action.input!=='object'))throw new Error('The assistant returned an unsupported action.');
        const answer=typeof body.answer==='string'?body.answer.trim():'';
        if(!actions.length&&!answer)throw new Error('Gemini returned no answer. Please try again.');
        if(actions.length&&!Array.isArray(body.messages))throw new Error('The assistant could not prepare that action. Please try again.');
        const responseMessages=Array.isArray(body.messages)?withoutContextReads(body.messages):[];
        turn.messages.push(...(responseMessages.length?responseMessages:answer?[{role:'assistant' as const,content:answer}]:[]));
        if(answer)setMessages(previous=>[...previous,{role:'assistant' as const,text:answer}].slice(-30));
        if(!actions.length){complete();return;}
        for(const action of actions){
          let output:unknown;
          const previous=turn.outputs.get(action.id),input=JSON.stringify({name:action.name,input:action.input});
          if(previous)output=previous.input===input?previous.output:{success:false,error:'A repeated action identifier had different arguments.'};
          else if(controller.signal.aborted)output={success:false,cancelled:true,error:'Stopped by the user before this action started.'};
          else {
            setStatus(activity[action.name]);
            try{output=await current.current.execute(action);}catch(e){output={success:false,error:e instanceof Error?e.message:'The action failed.'};}
            // Checkpoint results before the next network call. Retry resumes here
            // rather than recreating a saved strategy or running another backtest.
            turn.outputs.set(action.id,{input,output});
          }
          if(!alive.current)return;
          turn.messages.push({role:'tool',content:[{type:'tool-result',toolCallId:action.id,toolName:action.name,output:{type:'json',value:JSON.parse(JSON.stringify(output??null))}}]});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        setStatus('Summarizing the result…');
      }
      throw new Error('That request needs more steps. Send a follow-up to continue.');
    }catch(e){if(alive.current){if(controller.signal.aborted){complete();setNotice(turn.outputs.size?'Stopped. Completed changes are kept.':'Response stopped.');}else setError(e instanceof Error&&e.name==='TimeoutError'?'Gemini took too long. Try again to continue.':e instanceof Error?e.message:'The assistant could not finish.');}}
    finally{locked.current=false;operation.current=null;if(alive.current){setStatus('');setStopping(false);}}
  }
  return {open,setOpen,closing,finishClose:()=>setClosing(false),anchor,origin,expanded,setExpanded,messages,status,error,notice,stopping,send,retry:()=>{if(pending.current)void send(pending.current.prompt,true);},stop:()=>{if(operation.current){operation.current.abort();setStopping(true);setStatus('Stopping after the current action…');}},clear:()=>{if(!locked.current){history.current=[];pending.current=null;setMessages([]);setError('');setNotice('');}}};
}
type Controller=ReturnType<typeof useAssistantController>;
export function AssistantProvider({controller,children}:{controller:Controller;children:ReactNode}){return <AssistantContext.Provider value={controller}>{children}<AssistantOverlay/></AssistantContext.Provider>;}
export function AssistantLauncher(){const a=useAssistantContext();const reduced=useReducedMotion();return <div ref={a.anchor} className="assistant-launcher-slot">{!a.open&&!a.closing&&<motion.button className="design-ai-launcher" style={{borderRadius:24}} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?0:.12}} aria-label="Open AI assistant" onClick={()=>a.setOpen(true)}><img src="/design/ai-wall.svg" alt=""/><span className="assistant-launcher-label" aria-hidden="true">AI Assistant</span></motion.button>}</div>;}
function AssistantOverlay(){
  const reduced=useReducedMotion();
  const a=useAssistantContext();const [prompt,setPrompt]=useState(''),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  const [viewport,setViewport]=useState({width:innerWidth,height:innerHeight});
  const root=useRef<HTMLDivElement>(null),thread=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),restore=useRef<HTMLElement|null>(null);
  const following=useRef(true);const [unread,setUnread]=useState(false);
  const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const clamp=(left:number,top:number)=>{const r=root.current?.getBoundingClientRect();return {left:Math.max(12,Math.min(left,innerWidth-(r?.width??290)-12)),top:Math.max(12,Math.min(top,innerHeight-(r?.height??343)-12))};};
  useEffect(()=>{if(!a.open)return;restore.current=document.activeElement as HTMLElement;const raf=requestAnimationFrame(()=>input.current?.focus());const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')a.setOpen(false);};addEventListener('keydown',escape);return()=>{cancelAnimationFrame(raf);removeEventListener('keydown',escape);};},[a.open]);
  useEffect(()=>{if(!a.open)return;if(following.current){thread.current?.scrollTo({top:thread.current.scrollHeight});setUnread(false);}else setUnread(true);},[a.messages,a.open]);
  useEffect(()=>{const element=input.current;if(element){element.style.height='auto';element.style.height=Math.min(90,Math.max(38,element.scrollHeight))+'px';}},[prompt,a.open,a.expanded]);
  useEffect(()=>{if(a.open||a.closing||!restore.current)return;const previous=restore.current;const launcher=document.querySelector<HTMLButtonElement>('.design-ai-launcher');if(previous!==document.body&&previous.isConnected)previous.focus();else if(launcher?.getClientRects().length)launcher.focus();else document.querySelector<HTMLButtonElement>('.design-mobile-menu')?.focus();},[a.open,a.closing]);
  useEffect(()=>{const resize=()=>{setViewport({width:innerWidth,height:innerHeight});setPosition(p=>p?clamp(p.left,p.top):p);};addEventListener('resize',resize);return()=>removeEventListener('resize',resize);},[]);
  useEffect(()=>{if(position)requestAnimationFrame(()=>setPosition(p=>p?clamp(p.left,p.top):p));},[a.expanded]);
  const submit=()=>{if(prompt.trim()&&!a.status){following.current=true;void a.send(prompt);setPrompt('');}};
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
        <CardTitle icon={designIcons.assistant}>AI assistant</CardTitle><div className="assistant-header-actions"><button type="button" aria-label="New conversation" disabled={!!a.status} title="New conversation" onClick={()=>{following.current=true;setPrompt('');a.clear();input.current?.focus();}}><Plus size={14}/></button><button type="button" aria-label={a.expanded?'Minimize assistant':'Expand assistant'} onClick={()=>a.setExpanded(!a.expanded)}>{a.expanded?<Minimize2 size={13}/>:<Maximize2 size={13}/>}</button><button type="button" aria-label="Close assistant" title="Close assistant" onClick={()=>{a.setOpen(false);restore.current?.focus();}}><X size={14}/></button></div>
      </header>
      <div ref={thread} className="assistant-thread" role="log" aria-label="Conversation history" aria-live="polite" onScroll={()=>{const el=thread.current;if(el){following.current=el.scrollHeight-el.scrollTop-el.clientHeight<36;if(following.current)setUnread(false);}}}>
        {!a.messages.length?<div className="assistant-welcome"><h2>What can I<br/>help you with?</h2><div className="assistant-suggestions">{['Review my strategy','Explain drawdown'].map(text=><button key={text} onClick={()=>void a.send(text)}>{text}</button>)}</div></div>:a.messages.map((m,i)=><div key={i} className={`assistant-message ${m.role}`} role="article" aria-label={m.role==='user'?'Your message':'Assistant response'}>{m.role==='user'?m.text:<Markdown skipHtml allowedElements={['p','strong','em','ul','ol','li','h1','h2','h3','h4','h5','h6','code','pre','blockquote','br','hr','a']} components={{a:({node:_,...props})=><a {...props} target="_blank" rel="noopener noreferrer"/>}}>{m.text}</Markdown>}</div>)}
      </div>
      {unread&&<button type="button" className="assistant-latest" onClick={()=>{following.current=true;thread.current?.scrollTo({top:thread.current.scrollHeight,behavior:reduced?'instant':'smooth'});setUnread(false);}}>Latest reply ↓</button>}
      <div className="assistant-feedback">
        {a.status&&<p className="assistant-activity" role="status"><span aria-hidden="true"/>{a.status}</p>}
        {a.notice&&<p className="assistant-notice" role="status">{a.notice}</p>}
        {a.error&&<div className="assistant-chat-error" role="alert"><span>{a.error}</span><button type="button" onClick={a.retry}>Try again</button></div>}
      </div>
      <form onSubmit={e=>{e.preventDefault();submit();}}><textarea ref={input} rows={1} aria-label="Message AI assistant" placeholder={a.messages.length?'Ask a follow-up…':'Ask anything…'} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/>{a.status?<button type="button" aria-label="Stop assistant" disabled={a.stopping} onClick={a.stop}><Square size={14}/></button>:<button aria-label="Send assistant message" disabled={!prompt.trim()}><Send size={17}/></button>}</form>
    </motion.section>
  </motion.div>}</AnimatePresence>,document.body);
}
