import { useEffect, useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';

export default function GraphNumber({value,percent=false}:{value:number;percent?:boolean}) {
  const reduced=useReducedMotion();
  const spring=useSpring(value,{stiffness:360,damping:36,mass:.5});
  const [display,setDisplay]=useState(value);
  useMotionValueEvent(spring,'change',setDisplay);
  useEffect(()=>{if(reduced)spring.jump(value);else spring.set(value);},[value,reduced,spring]);
  const format=(n:number)=>percent?`${n.toFixed(1)}%`:`$${Math.round(n).toLocaleString('en-US')}`;
  return <span className="graph-motion-number" aria-label={format(value)}><span aria-hidden="true">{format(reduced?value:display)}</span></span>;
}
