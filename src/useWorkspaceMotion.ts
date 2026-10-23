import {useLayoutEffect} from 'react';
import {useAnimate} from 'motion/react';
import useReducedMotionPreference from './useReducedMotionPreference';

const panels='.design-page-heading,.design-card:not(.floating),.workspace-page-heading,.page-header,.workspace-panel,.panel,.result-metric,.result-panel';
export default function useWorkspaceMotion(page:string) {
 const [scope,animate]=useAnimate<HTMLDivElement>();
 const reduced=useReducedMotionPreference();
 useLayoutEffect(()=>{
  const root=scope.current;
  if(!root)return;
  const seen=new Set<HTMLElement>();
  const animations:ReturnType<typeof animate>[]=[];
  const played=new Set<HTMLElement>();
  function reveal(nodes:HTMLElement[]){
   const fresh=nodes.filter(node=>!played.has(node));
   fresh.forEach(node=>played.add(node));
   if(reduced||!fresh.length)return;
   // Only opacity and translation change; controls keep their final layout.
   animations.push(animate(fresh,{opacity:[0,1],translate:['0 8px','0 0']},{duration:.38,delay:i=>Math.min(i*.035,.14),ease:[.22,1,.36,1]}));
  }
  const visibility=new IntersectionObserver(entries=>{
   const entering=entries.filter(entry=>entry.isIntersecting).map(entry=>entry.target as HTMLElement);
   entering.forEach(node=>visibility.unobserve(node));reveal(entering);
  },{threshold:.08});
  function enter(){
   const nodes=[...root.querySelectorAll<HTMLElement>(panels)].filter(node=>!seen.has(node)&&!node.parentElement?.closest(panels));
   if(!nodes.length)return;
   nodes.forEach(node=>seen.add(node));
   if(reduced)return;
   const visible=nodes.filter(node=>{const box=node.getBoundingClientRect();return box.top<innerHeight&&box.bottom>0;});
   reveal(visible);
   nodes.filter(node=>!played.has(node)).forEach(node=>visibility.observe(node));
  }
  enter();
  // Lazy editors and loaded libraries mount after the route's first render.
  const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===Node.ELEMENT_NODE)))enter();});
  observer.observe(root,{childList:true,subtree:true});
  return()=>{observer.disconnect();visibility.disconnect();animations.forEach(animation=>animation.stop());seen.forEach(node=>{node.style.opacity='';node.style.translate='';});};
 },[page,reduced,scope,animate]);
 return {scope,reduced};
}
