import {useSyncExternalStore} from 'react';

export type MotionPreference='system'|'full'|'reduced';
const key='testify-motion-v1';
const media=typeof window==='undefined'?null:window.matchMedia('(prefers-reduced-motion: reduce)');
const listeners=new Set<()=>void>();
const valid=(value:unknown):value is MotionPreference=>value==='system'||value==='full'||value==='reduced';
function read():MotionPreference {try{const value=localStorage.getItem(key);return valid(value)?value:'full';}catch{return 'full';}}
let preference:MotionPreference=typeof window==='undefined'?'full':read();
const isReduced=()=>preference==='reduced'||(preference==='system'&&!!media?.matches);
function apply(){if(typeof document!=='undefined'){document.documentElement.dataset.motion=isReduced()?'reduced':'full';document.documentElement.dataset.motionPreference=preference;}}
function notify(){apply();listeners.forEach(listener=>listener());}
function storage(event:StorageEvent){if(event.key===key||event.key===null){preference=read();notify();}}
function subscribe(listener:()=>void){
 listeners.add(listener);
 if(listeners.size===1){media?.addEventListener('change',notify);window.addEventListener('storage',storage);}
 return()=>{listeners.delete(listener);if(!listeners.size){media?.removeEventListener('change',notify);window.removeEventListener('storage',storage);}};
}
export function setMotionPreference(value:MotionPreference){
 if(!valid(value))return;
 preference=value;try{localStorage.setItem(key,value);}catch{/* Keep the choice for this session when storage is unavailable. */}
 notify();
}
const snapshot=()=>`${preference}:${media?.matches?'1':'0'}`;
export function useMotionPreference(){
 const value=useSyncExternalStore(subscribe,snapshot,()=> 'full:0');
 const [choice,system]=value.split(':') as [MotionPreference,string],systemReduced=system==='1';
 return {preference:choice,systemReduced,reduced:choice==='reduced'||(choice==='system'&&systemReduced),setPreference:setMotionPreference};
}
export default function useReducedMotionPreference(){return useMotionPreference().reduced;}
// Full motion is the product default. A visitor can explicitly select reduced
// motion or follow their device in the profile menu. Apply CSS before paint.
apply();
