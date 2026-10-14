import {useEffect,type PointerEvent} from 'react';
import {useMotionTemplate,useSpring} from 'motion/react';
import useReducedMotionPreference from './useReducedMotionPreference';

export default function useCardTilt(disabled=false) {
 const reduced=useReducedMotionPreference();
 const x=useSpring(0,{stiffness:170,damping:26,mass:.6}),y=useSpring(0,{stiffness:170,damping:26,mass:.6});
 const transform=useMotionTemplate`perspective(1000px) translateY(var(--card-enter-y, 0px)) rotateX(${x}deg) rotateY(${y}deg)`;
 const reset=()=>{x.set(0);y.set(0);};
 useEffect(()=>{if(reduced||disabled){x.jump(0);y.jump(0);}},[reduced,disabled,x,y]);
 const onPointerMove=(event:PointerEvent<HTMLElement>)=>{
  if(reduced||disabled||event.pointerType==='touch'||!matchMedia('(hover: hover) and (pointer: fine)').matches)return;
  const card=event.currentTarget;
  // Keep every card containing controls still, including while a field is being edited.
  if(card.querySelector('button,a,input,select,textarea,[role="button"]')){reset();return;}
  const box=card.getBoundingClientRect();
  x.set(Math.max(-.8,Math.min(.8,-((event.clientY-box.top)/box.height-.5)*1.6)));
  y.set(Math.max(-.8,Math.min(.8,((event.clientX-box.left)/box.width-.5)*1.6)));
 };
 return {style:{transform:reduced||disabled?'none':transform},onPointerMove,onPointerLeave:reset,onPointerCancel:reset};
}
