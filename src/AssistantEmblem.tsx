import {useId} from 'react';
import {motion} from 'motion/react';
import useReducedMotionPreference from './useReducedMotionPreference';

// The approved Penpot star, kept as vectors so its metallic edge can move.
const resting='M24 3 L31 17 L45 24 L31 31 L24 45 L17 31 L3 24 L17 17 Z';
const awake='M24 1 L32 16 L47 24 L32 32 L24 47 L16 32 L1 24 L16 16 Z';
export default function AssistantEmblem({active=false,emphasized=false,initialEmphasized=false}:{active?:boolean;emphasized?:boolean;initialEmphasized?:boolean}){
 const id=useId().replace(/:/g,''),reduced=useReducedMotionPreference(),length=emphasized?136:125.22;
 const shape={d:emphasized&&!reduced?awake:resting};
 return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className="assistant-emblem">
  <defs><linearGradient id={id} x1="3" y1="3" x2="45" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor={emphasized?'#fff7ff':'#e0dfe6'}/><stop offset=".34" stopColor={emphasized?'#c3b7e5':'#787581'}/><stop offset=".62" stopColor="#33313e"/><stop offset="1" stopColor={emphasized?'#a99ad3':'#777481'}/></linearGradient></defs>
  <motion.path initial={reduced?false:{d:initialEmphasized?awake:resting}} animate={shape} transition={reduced?{duration:0}:{type:'spring',stiffness:380,damping:25}} fill="#7661b70d" stroke={`url(#${id})`} strokeWidth="3.4" strokeLinejoin="round"/>
  <motion.path className="assistant-emblem-glint" initial={reduced?false:{d:initialEmphasized?awake:resting}} animate={{...shape,strokeDashoffset:active&&!reduced?[0,-length]:0,opacity:active&&!reduced?(emphasized ? .85 : .55):0}} transition={{d:reduced?{duration:0}:{type:'spring',stiffness:380,damping:25},strokeDashoffset:{duration:reduced?0:emphasized?1.8:6.5,repeat:active&&!reduced?Infinity:0,ease:'linear'},opacity:{duration:reduced?0:.3}}} stroke="#fff3ff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`19 ${length-19}`}/>
 </svg>;
}
