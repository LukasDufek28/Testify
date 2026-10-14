import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Circle, LoaderCircle, Play, X } from 'lucide-react';
import './run-status.css';
export type RunState='idle'|'processing'|'success'|'error'|'cancelled';
const labels:Record<RunState,string>={idle:'Run backtest',processing:'Processing…',success:'Done',error:'Failed · Try again',cancelled:'Cancelled · Try again'};
export default function RunStatusBadge({state,announce=false}:{state:RunState;announce?:boolean}) {
  const reduced=useReducedMotion();
  const Icon=state==='processing'?LoaderCircle:state==='success'?Check:state==='error'?X:state==='cancelled'?Circle:Play;
  return <motion.span layout={!reduced} className="run-state-badge" data-run-state={state} role={announce?'status':undefined} transition={{type:'spring',stiffness:420,damping:32}}>
    <AnimatePresence initial={false} mode="popLayout"><motion.span key={state} className="run-state-content" initial={reduced?false:{opacity:0,y:7,filter:'blur(3px)'}} animate={{opacity:1,y:0,filter:'blur(0px)'}} exit={reduced?undefined:{opacity:0,y:-7,filter:'blur(3px)'}} transition={{duration:reduced?0:.2}}>
      <motion.span className="run-state-icon" aria-hidden="true" animate={state==='processing'&&!reduced?{rotate:360}:{rotate:0}} transition={state==='processing'&&!reduced?{duration:1,repeat:Infinity,ease:'linear'}:{duration:0}}><Icon size={16}/></motion.span><span>{labels[state]}</span>
    </motion.span></AnimatePresence>
  </motion.span>;
}
