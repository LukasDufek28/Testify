import {useSyncExternalStore} from 'react';
const listeners=new Set<()=>void>();
const media=typeof window==='undefined'?null:window.matchMedia('(prefers-reduced-motion: reduce)');
const notify=()=>listeners.forEach(listener=>listener());
const subscribe=(listener:()=>void)=>{
 listeners.add(listener);if(listeners.size===1)media?.addEventListener('change',notify);
 return()=>{listeners.delete(listener);if(!listeners.size)media?.removeEventListener('change',notify);};
};
export default function useReducedMotionPreference(){return useSyncExternalStore(subscribe,()=>media?.matches??false,()=>false);}
