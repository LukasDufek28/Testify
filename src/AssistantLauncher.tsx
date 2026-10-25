import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {motion,useSpring,useTransform} from 'motion/react';
import {useAssistantContext} from './assistant-context';
import {useMotionPreference} from './useReducedMotionPreference';
import AssistantEmblem from './AssistantEmblem';
import {surfaceSpring} from './motion-tokens';

export default function AssistantLauncher({onOpen}:{onOpen?:()=>void}){
 const a=useAssistantContext(),{reduced,preference,systemReduced,setPreference}=useMotionPreference();
 const button=useRef<HTMLButtonElement>(null),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[visible,setVisible]=useState(false);
 const x=useSpring(0,{stiffness:240,damping:24}),y=useSpring(0,{stiffness:240,damping:24});
 const rotateX=useTransform(y,v=>-v*.3),rotateY=useTransform(x,v=>v*.22),lightX=useTransform(x,v=>v*1.8),lightY=useTransform(y,v=>v*1.5);
 const awake=hovered||focused||!!a.status,active=visible&&!reduced;
 const reset=()=>{x.set(0);y.set(0);};
 useEffect(()=>{
  const element=button.current;if(!element)return;
  let inView=false;const update=()=>setVisible(inView&&!document.hidden);
  const observer=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??false;update();});observer.observe(element);document.addEventListener('visibilitychange',update);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);};
 },[a.open,a.closing]);
 useEffect(()=>{if(reduced){x.jump(0);y.jump(0);}},[reduced,x,y]);
 const move=(event:PointerEvent<HTMLButtonElement>)=>{
  if(reduced||event.pointerType==='touch'||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  const rect=event.currentTarget.getBoundingClientRect();x.set(((event.clientX-rect.left)/rect.width-.5)*22);y.set(((event.clientY-rect.top)/rect.height-.5)*12);
 };
 return <div className="assistant-launcher-wrap"><div ref={a.anchor} className="assistant-launcher-slot">{!a.open&&!a.closing&&<motion.button ref={button} className="design-ai-launcher" data-awake={awake} data-motion-active={active} aria-label="Open AI assistant" aria-haspopup="dialog" initial="rest" animate="rest" whileTap={reduced?undefined:'pressed'} onPointerEnter={event=>{if(event.pointerType!=='touch')setHovered(true);}} onPointerMove={move} onPointerLeave={()=>{setHovered(false);reset();}} onPointerCancel={()=>{setHovered(false);reset();}} onFocus={event=>setFocused(event.currentTarget.matches(':focus-visible'))} onBlur={()=>{setFocused(false);reset();}} onClick={()=>{setHovered(false);setFocused(false);a.setOpen(true);x.jump(0);y.jump(0);onOpen?.();}}>
  <motion.span className="assistant-launcher-face" aria-hidden="true" style={reduced?{transform:'none'}:{rotateX,rotateY,transformPerspective:800}} variants={{rest:{scale:1},pressed:{scale:.965}}} transition={reduced?{duration:0}:surfaceSpring}>
   <motion.span className="assistant-launcher-light" style={{x:lightX,y:lightY}} animate={{opacity:awake ? .7 : .22,scale:awake?1.35:1}} transition={{duration:reduced?0:.4}}/>
   <motion.span className="assistant-launcher-emblem" style={{x,y}}><motion.span className="assistant-launcher-emblem-core" animate={reduced?{scale:1,rotate:0,y:0}:awake?{scale:1.18,rotate:12,y:-4}:active?{scale:[1,1.035,1],rotate:[0,-3,0],y:[0,-3,0]}:{scale:1,rotate:0,y:0}} transition={reduced?{duration:0}:awake?{type:'spring',stiffness:350,damping:20}:{duration:5,repeat:active?Infinity:0,ease:'easeInOut'}}><AssistantEmblem active={active} emphasized={awake}/></motion.span></motion.span>
  </motion.span>
  <span className="assistant-launcher-label" aria-hidden="true">AI Assistant</span>
  {a.status&&<span className="assistant-launcher-working" aria-hidden="true"><i/><i/><i/></span>}
 </motion.button>}</div>{!a.open&&!a.closing&&preference==='system'&&systemReduced&&<button type="button" className="assistant-enable-motion" title="Your device has reduced motion enabled. Play animations in Testify only." onClick={()=>{setPreference('full');button.current?.focus();}}>Enable animations <span aria-hidden="true">↗</span></button>}</div>;
}
