import {useLayoutEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion} from 'motion/react';
import {useMotionPreference} from './useReducedMotionPreference';
import {ChevronUp,LogOut,Sparkles,Monitor} from 'lucide-react';
import './account-menu.css';
import {surfaceSpring} from './motion-tokens';

export default function AccountMenu({email,busy,onLogout,error}:{email:string;busy:boolean;onLogout:()=>void;error?:string}) {
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:260});
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),logout=useRef<HTMLButtonElement>(null);
 const id=useId(),{reduced,preference,systemReduced,setPreference}=useMotionPreference();
 const guest=email.endsWith('@preview.testify.invalid');
 const name=guest?'Preview guest':email==='demo@testify.local'?'Demo account':email.split('@')[0].split(/[._-]/).map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const box=trigger.current!.getBoundingClientRect(),width=Math.min(280,innerWidth-32),height=popup.current?.offsetHeight??170;setPosition({left:Math.max(16,Math.min(box.left,innerWidth-width-16)),top:Math.max(16,Math.min(box.top-height-10,innerHeight-height-16)),width});};
  place();logout.current?.focus();
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setOpen(false);};
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}
   if(event.key==='Tab')setOpen(false);
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    const items=[...popup.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement);
    if(!items.length)return;event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
   }
  };
  const observer=new ResizeObserver(place);if(popup.current)observer.observe(popup.current);
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{observer.disconnect();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open]);
 return <div className="account-menu" ref={root}>
  <button ref={trigger} type="button" className="account-menu-trigger" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(v=>!v)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);}}}>
   <span className="account-avatar" aria-hidden="true">{name[0]}</span><span className="account-identity"><strong>{name}</strong><small>{guest?'Temporary workspace':email}</small></span><ChevronUp size={14} aria-hidden="true"/>
  </button>
  {createPortal(<AnimatePresence>{open&&<motion.div ref={popup} id={id} className="account-popup" role="menu" aria-label="Account menu" style={position} initial={reduced?false:{opacity:0,y:8,scale:.985}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:5,transition:{duration:reduced?0:.12}}} transition={reduced?{duration:0}:surfaceSpring}>
   <div className="account-popup-details"><strong>{name}</strong><small>{guest?'Temporary preview workspace':email}</small></div>
   <button type="button" role="menuitemcheckbox" aria-checked={!reduced} onClick={()=>setPreference(reduced?'full':'reduced')}><Sparkles size={16} aria-hidden="true"/><span className="account-motion-label">Animations<small>{preference==='system'?`Device setting · ${systemReduced?'Off':'On'}`:'For this device'}</small></span><span className="account-motion-value" aria-hidden="true">{reduced?'Off':'On'}</span></button>
   {preference!=='system'&&<button type="button" role="menuitem" className="account-motion-reset" onClick={()=>{setPreference('system');popup.current?.querySelector<HTMLButtonElement>('[role=menuitemcheckbox]')?.focus();}}><Monitor size={16} aria-hidden="true"/>Use device setting</button>}
   <button ref={logout} type="button" role="menuitem" disabled={busy} onClick={onLogout}><LogOut size={16} aria-hidden="true"/>{busy?'Signing out…':'Sign out'}</button>
   {error&&<p role="alert">{error}</p>}
  </motion.div>}</AnimatePresence>,document.body)}
 </div>;
}
