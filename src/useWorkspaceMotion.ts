import {useLayoutEffect} from 'react';
import {useAnimate} from 'motion/react';
import useReducedMotionPreference from './useReducedMotionPreference';
import {easeOut} from './motion-tokens';

const panels='.design-page-heading,.design-card:not(.floating),.workspace-page-heading,.page-header,.workspace-panel,.panel,.result-metric,.result-panel';
const rows='.history-table tbody tr,.workspace-table tbody tr,.design-trade-history tbody tr';
export default function useWorkspaceMotion(page:string) {
 const [scope,animate]=useAnimate<HTMLDivElement>();
 const reduced=useReducedMotionPreference();
 useLayoutEffect(()=>{
  const root=scope.current;
  if(!root)return;
  const seen=new Set<HTMLElement>();
  const animations:ReturnType<typeof animate>[]=[];
  const played=new Set<HTMLElement>();
  const disclosures=new Map<HTMLDetailsElement,{target:boolean;animation:ReturnType<typeof animate>;summary:HTMLElement}>();
  function reveal(nodes:HTMLElement[]){
   const fresh=nodes.filter(node=>!played.has(node));
   fresh.forEach(node=>played.add(node));
   if(reduced||!fresh.length)return;
   // Only opacity and translation change; controls keep their final layout.
   const tableRows=fresh.filter(node=>node.matches(rows));
   const surfaces=fresh.filter(node=>!node.matches(rows));
   const interactive=(node:HTMLElement)=>node.matches('details')||!!node.querySelector('button,a,input,select,textarea,summary,[role="combobox"]');
   const cards=surfaces.filter(node=>!interactive(node)),controls=surfaces.filter(interactive);
   if(cards.length)animations.push(animate(cards,{opacity:[0,1],translate:['0 22px','0 0']},{duration:.58,delay:i=>Math.min(i*.065,.26),ease:easeOut}));
   // Scrolling to a form must never move its click target between pointer down
   // and pointer up. Interactive surfaces fade in at their final coordinates.
   controls.forEach(node=>{node.style.translate='0 0';});
   if(controls.length)animations.push(animate(controls,{opacity:[0,1]},{duration:.25,delay:i=>Math.min(i*.035,.1),ease:easeOut}));
   if(tableRows.length)animations.push(animate(tableRows,{opacity:[0,1]},{duration:.22,delay:i=>Math.min(i*.014,.1),ease:easeOut}));
  }
  const visibility=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{(entry.target as HTMLElement).dataset.motionInView=String(entry.isIntersecting);});
   reveal(entries.filter(entry=>entry.isIntersecting).map(entry=>entry.target as HTMLElement));
  },{threshold:.08});
  function enter(){
   const nodes=[...root.querySelectorAll<HTMLElement>(panels+','+rows)].filter(node=>!seen.has(node)&&(node.matches(rows)||!node.parentElement?.closest(panels)));
   if(!nodes.length)return;
   nodes.forEach(node=>seen.add(node));
   if(reduced)return;
   const visible=nodes.filter(node=>{const box=node.getBoundingClientRect();return box.top<innerHeight&&box.bottom>0;});
   reveal(visible);
   nodes.forEach(node=>visibility.observe(node));
  }
  function toggleDisclosure(event:MouseEvent){
   const target=event.target as Element;
   if(reduced||event.defaultPrevented||target.closest('button,a,input,select,textarea'))return;
   const summary=target.closest('summary'),details=summary?.parentElement;
   if(!(summary instanceof HTMLElement)||!(details instanceof HTMLDetailsElement)||!root.contains(details))return;
   // Menus are overlays; price previews mount their chart on the native toggle.
   // Neither has a stable content height that should be clipped as an accordion.
   if(summary.matches('.design-button,.dashboard-button')||details.matches('.strategy-card-actions details,.price-preview'))return;
   event.preventDefault();
   const previous=disclosures.get(details),opening=!(previous?.target??details.open);
   const from=details.getBoundingClientRect().height;
   previous?.animation.stop();details.style.height='';details.style.overflow='';
   details.open=opening;const to=details.getBoundingClientRect().height;
   // Keep content mounted while closing; only the surface height changes, so
   // labels and controls never stretch with the accordion.
   details.open=true;details.style.height=from+'px';details.style.overflow='clip';
   summary.setAttribute('aria-expanded',String(opening));details.dataset.motionDisclosure=opening?'expanding':'collapsing';
   const animation=animate(details,{height:[from,to]},{duration:opening ? .3 : .22,ease:easeOut});
   const operation={target:opening,animation,summary};disclosures.set(details,operation);
   void Promise.resolve(animation).then(()=>{
    if(disclosures.get(details)!==operation)return;
    details.open=opening;details.style.height='';details.style.overflow='';delete details.dataset.motionDisclosure;summary.removeAttribute('aria-expanded');disclosures.delete(details);
   });
  }
  const visibilityChanged=()=>{root.dataset.motionDocumentHidden=String(document.hidden);};
  visibilityChanged();document.addEventListener('visibilitychange',visibilityChanged);root.addEventListener('click',toggleDisclosure);
  enter();
  // Lazy editors and loaded libraries mount after the route's first render.
  const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===Node.ELEMENT_NODE)))enter();});
  observer.observe(root,{childList:true,subtree:true});
  return()=>{observer.disconnect();visibility.disconnect();document.removeEventListener('visibilitychange',visibilityChanged);root.removeEventListener('click',toggleDisclosure);animations.forEach(animation=>animation.stop());seen.forEach(node=>{node.style.opacity='';node.style.translate='';delete node.dataset.motionInView;});disclosures.forEach((operation,details)=>{operation.animation.stop();details.open=operation.target;details.style.height='';details.style.overflow='';operation.summary.removeAttribute('aria-expanded');delete details.dataset.motionDisclosure;});delete root.dataset.motionDocumentHidden;};
 },[page,reduced,scope,animate]);
 return {scope,reduced};
}
