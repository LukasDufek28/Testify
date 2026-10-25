import { AnimatePresence, motion} from 'motion/react';
import useReducedMotion from './useReducedMotionPreference';
import { Check, Circle, LoaderCircle, Play, X } from 'lucide-react';
import './run-status.css';
import {surfaceSpring,quickFade} from './motion-tokens';
export type RunState='idle'|'processing'|'success'|'error'|'cancelled';
const labels:Record<RunState,string>={idle:'Run backtest',processing:'Processing…',success:'Done',error:'Failed · Try again',cancelled:'Cancelled · Try again'};
export default function RunStatusBadge({state,announce=false}:{state:RunState;announce?:boolean}) {
  const reduced=useReducedMotion();
  const Icon=state==='processing'?LoaderCircle:state==='success'?Check:state==='error'?X:state==='cancelled'?Circle:Play;
  return <motion.span layout={!reduced} className="run-state-badge" data-run-state={state} role={announce?'status':undefined} transition={reduced?{duration:0}:surfaceSpring}>
    <AnimatePresence initial={false} mode="popLayout"><motion.span key={state} className="run-state-content" initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={reduced?undefined:{opacity:0,y:-6}} transition={reduced?{duration:0}:quickFade}>
      <motion.span className="run-state-icon" aria-hidden="true" animate={state==='processing'&&!reduced?{rotate:360}:{rotate:0}} transition={state==='processing'&&!reduced?{duration:1,repeat:Infinity,ease:'linear'}:{duration:0}}><Icon size={16}/></motion.span><span>{labels[state]}</span>
    </motion.span></AnimatePresence>
  </motion.span>;
}
