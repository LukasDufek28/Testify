import {useEffect,useState} from 'react';
import {AnimatePresence,motion,useIsPresent} from 'motion/react';
import RunStatusBadge,{type RunState} from './RunStatusBadge';
import useReducedMotionPreference from './useReducedMotionPreference';
import {easeOut,surfaceSpring} from './motion-tokens';
import './backtest-run-motion.css';

const fraction=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value/100:0));
export function BacktestRunButton({state,progress,disabled,onRun}:{state:RunState;progress:number;disabled:boolean;onRun:()=>void}){
 const reduced=useReducedMotionPreference(),shown=state==='success'?'idle':state;
 return <button className="design-button design-run-control" aria-label="Start backtest" aria-busy={shown==='processing'} data-run-state={shown} disabled={disabled} onClick={onRun}>
  <motion.span aria-hidden="true" className="run-control-fill" initial={false} animate={{scaleX:shown==='processing'?fraction(progress):0,opacity:shown==='processing'?1:0}} transition={{duration:reduced?0:.35,ease:easeOut}}/>
  <RunStatusBadge state={shown}/>
 </button>;
}

type ProgressProps={progress:number;text:string;strategy:string;remaining?:number;onCancel:()=>void};
function ProgressCard({progress,text,strategy,remaining,onCancel}:ProgressProps){
 const reduced=useReducedMotionPreference(),present=useIsPresent(),value=fraction(progress);
 return <motion.div inert={!present} className="run-progress-stage" initial={reduced?false:{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={reduced?{duration:0}:{height:surfaceSpring,opacity:{duration:.2}}}>
  <section className="design-card raised design-progress" data-motion-owned="true">
   <div className="run-progress-heading"><div className="run-progress-orbit" aria-hidden="true"><svg viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="18" stroke="#ffffff12" strokeWidth="2"/><motion.circle cx="22" cy="22" r="18" stroke="#b7a3f1" strokeWidth="2" strokeLinecap="round" style={{rotate:-90,transformOrigin:'50% 50%'}} initial={false} animate={{pathLength:value}} transition={{duration:reduced?0:.4,ease:easeOut}}/><motion.g initial={false} animate={{rotate:value*360,opacity:value>0?1:0}} style={{transformOrigin:'22px 22px'}} transition={{duration:reduced?0:.4,ease:easeOut}}><circle cx="22" cy="4" r="2.5" fill="#e3d8ff"/></motion.g></svg><strong>{Math.round(value*100)}<small>%</small></strong></div><div><h2>Running backtest</h2><p>{strategy}</p></div></div>
   <div role="progressbar" aria-label="Backtest processing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value*100)}><motion.span initial={false} animate={{scaleX:value}} transition={{duration:reduced?0:.4,ease:easeOut}}/></div>
   <div className="run-progress-footer"><div><p>{text}</p>{remaining!==undefined&&<p className="run-progress-estimate" role="status">~{remaining}s remaining · estimate</p>}</div><button className="design-button secondary" onClick={onCancel}>Cancel backtest</button></div>
  </section>
 </motion.div>;
}
export function BacktestRunProgress({running,...props}:ProgressProps&{running:boolean}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{if(!running){setVisible(false);return;}const timer=setTimeout(()=>setVisible(true),180);return()=>clearTimeout(timer);},[running]);
 return <AnimatePresence initial={false}>{running&&visible&&<ProgressCard key="run-progress" {...props}/>}</AnimatePresence>;
}
