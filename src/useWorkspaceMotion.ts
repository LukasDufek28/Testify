import {useLayoutEffect} from 'react';
import {useAnimate} from 'motion/react';
import useReducedMotionPreference from './useReducedMotionPreference';

const panels='.design-page-heading,.design-card:not(.floating),.workspace-page-heading,.workspace-panel,.result-metric,.result-panel';
export default function useWorkspaceMotion(page:string) {
 const [scope,animate]=useAnimate<HTMLDivElement>();
 const reduced=useReducedMotionPreference();
 useLayoutEffect(()=>{
  const root=scope.current;
  if(!root)return;
  const seen=new Set<HTMLElement>();
  const animations:ReturnType<typeof animate>[]=[];
  function enter(){
   const nodes=[...root.querySelectorAll<HTMLElement>(panels)].filter(node=>!seen.has(node)&&!node.parentElement?.closest(panels));
   if(!nodes.length)return;
   nodes.forEach(node=>seen.add(node));
   if(reduced)return;
   // Independent translate leaves pointer tilt and the final layout untouched.
   animations.push(animate(nodes,{opacity:[0,1],translate:['0 6px','0 0']},{duration:.3,delay:i=>Math.min(i*.025,.125),ease:[.22,1,.36,1]}));
  }
  enter();
  // Lazy editors and loaded libraries mount after the route's first render.
  const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===Node.ELEMENT_NODE)))enter();});
  observer.observe(root,{childList:true,subtree:true});
  return()=>{observer.disconnect();animations.forEach(animation=>animation.stop());seen.forEach(node=>{node.style.opacity='';node.style.translate='';});};
 },[page,reduced,scope,animate]);
 return {scope,reduced};
}
