import {useLayoutEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {ChevronUp,LogOut} from 'lucide-react';
import './account-menu.css';

export default function AccountMenu({email,busy,onLogout,error}:{email:string;busy:boolean;onLogout:()=>void;error?:string}) {
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:260});
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),logout=useRef<HTMLButtonElement>(null);
 const id=useId(),reduced=useReducedMotion();
 const guest=email.endsWith('@preview.testify.invalid');
 const name=guest?'Preview guest':email==='demo@testify.local'?'Demo account':email.split('@')[0].split(/[._-]/).map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const box=trigger.current!.getBoundingClientRect(),width=Math.min(280,innerWidth-32);setPosition({left:Math.max(16,Math.min(box.left,innerWidth-width-16)),top:Math.max(16,box.top-170),width});};
  place();logout.current?.focus();
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setOpen(false);};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}if(event.key==='Tab')setOpen(false);};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open]);
 return <div className="account-menu" ref={root}>
  <button ref={trigger} type="button" className="account-menu-trigger" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(v=>!v)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);}}}>
   <span className="account-avatar" aria-hidden="true">{name[0]}</span><span className="account-identity"><strong>{name}</strong><small>{guest?'Temporary workspace':email}</small></span><ChevronUp size={14} aria-hidden="true"/>
  </button>
  {createPortal(<AnimatePresence>{open&&<motion.div ref={popup} id={id} className="account-popup" role="menu" aria-label="Account menu" style={position} initial={reduced?false:{opacity:0,y:6,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:4}} transition={{duration:reduced?0:.16}}>
   <div className="account-popup-details"><strong>{name}</strong><small>{guest?'Temporary preview workspace':email}</small></div>
   <button ref={logout} type="button" role="menuitem" disabled={busy} onClick={onLogout}><LogOut size={16} aria-hidden="true"/>{busy?'Signing out…':'Sign out'}</button>
   {error&&<p role="alert">{error}</p>}
  </motion.div>}</AnimatePresence>,document.body)}
 </div>;
}
