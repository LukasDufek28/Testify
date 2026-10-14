import {useEffect} from 'react';
import {stagger,useAnimate} from 'motion/react';
import useReducedMotionPreference from './useReducedMotionPreference';

export default function useWorkspaceMotion(page:string) {
 const [scope,animate]=useAnimate<HTMLDivElement>();
 const reduced=useReducedMotionPreference();
 useEffect(()=>{
  const nodes=scope.current?.querySelectorAll<HTMLElement>('.design-page-heading,.design-card:not(.floating),.workspace-page-heading,.workspace-panel,.result-metric,.result-panel');
  if(!nodes?.length)return;
  const animation=animate([...nodes],{opacity:reduced?1:[0,1],'--card-enter-y':reduced?'0px':['8px','0px']},{duration:reduced?0:.28,delay:reduced?0:stagger(.025),ease:[.22,1,.36,1]});
  return()=>animation.stop();
 },[page,reduced,scope,animate]);
 return {scope,reduced};
}
