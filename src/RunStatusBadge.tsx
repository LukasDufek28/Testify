import {useLayoutEffect,useRef,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import useReducedMotionPreference from './useReducedMotionPreference';
import './run-status.css';
import {surfaceSpring,quickFade} from './motion-tokens';
export type RunState='idle'|'processing'|'success'|'error'|'cancelled';
const labels:Record<RunState,string>={idle:'Run backtest',processing:'Processing…',success:'Done',error:'Failed · Try again',cancelled:'Cancelled · Try again'};
const colors:Record<RunState,{backgroundColor:string;borderColor:string;color:string}>={
 idle:{backgroundColor:'#ffffff08',borderColor:'#ffffff18',color:'#eeecf5'},
 processing:{backgroundColor:'#8d76d32b',borderColor:'#aa94e54d',color:'#ddd2ff'},
 success:{backgroundColor:'#91f5ab1a',borderColor:'#91f5ab40',color:'#91f5ab'},
 error:{backgroundColor:'#e69a9a1a',borderColor:'#e69a9a40',color:'#e69a9a'},
 cancelled:{backgroundColor:'#ffffff08',borderColor:'#ffffff18',color:'#aaa5b9'},
};
export default function RunStatusBadge({state,announce=false}:{state:RunState;announce?:boolean}) {
 const reduced=useReducedMotionPreference(),content=useRef<HTMLSpanElement>(null),[width,setWidth]=useState<number>();
 useLayoutEffect(()=>{const element=content.current;if(!element)return;const measure=()=>setWidth(element.getBoundingClientRect().width);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 return <motion.span className={`run-state-badge${announce?' is-announcement':''}`} data-run-state={state} role={announce?'status':undefined} initial={false} animate={{width:width??'auto'}} transition={reduced?{duration:0}:surfaceSpring}>
  <span ref={content} className="run-state-content">
   <motion.span className="run-state-symbol" aria-hidden="true" initial={false} animate={colors[state]} transition={{duration:reduced?0:.3}}>
    <AnimatePresence initial={state==='success'&&!reduced} mode="popLayout"><motion.span key={state} className="run-state-symbol-art" initial={reduced?false:{opacity:0,scale:.55,rotate:-35}} animate={{opacity:1,scale:1,rotate:0}} exit={reduced?undefined:{opacity:0,scale:.6,rotate:35}} transition={reduced?{duration:0}:{...surfaceSpring,opacity:quickFade}}>
     <motion.svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" animate={state==='processing'&&!reduced?{rotate:360}:{rotate:0}} transition={state==='processing'&&!reduced?{duration:1.1,repeat:Infinity,ease:'linear'}:{duration:0}}>
      {state==='idle'?<path d="M6 4.5 13 9 6 13.5Z" fill="currentColor" strokeWidth=".75"/>:state==='processing'?<><circle cx="9" cy="9" r="6" opacity=".2"/><path d="M9 3a6 6 0 0 1 6 6"/></>:state==='success'?<motion.path d="m4.5 9 3 3 6-6" initial={reduced?false:{pathLength:0,opacity:0}} animate={{pathLength:1,opacity:1}} transition={{duration:reduced?0:.32,delay:reduced?0:.08}}/>:state==='error'?<path d="m5.5 5.5 7 7m0-7-7 7"/>:<circle cx="9" cy="9" r="5.5"/>}
     </motion.svg>
    </motion.span></AnimatePresence>
   </motion.span>
   <span className="run-state-label"><AnimatePresence initial={false} mode="wait"><motion.span key={state} initial={reduced?false:{opacity:0,y:9}} animate={{opacity:1,y:0}} exit={reduced?undefined:{opacity:0,y:-9}} transition={reduced?{duration:0}:quickFade}>{labels[state]}</motion.span></AnimatePresence></span>
  </span>
 </motion.span>;
}
