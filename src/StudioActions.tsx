import {useEffect,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {Check,Play,Save,Undo2,ShieldCheck} from 'lucide-react';
import useReducedMotionPreference from './useReducedMotionPreference';
import {quickFade,surfaceSpring} from './motion-tokens';
import './studio-actions.css';

export type StudioOperation='save'|'validate'|'generate'|'loading'|null;
type State={operation:StudioOperation;saved:boolean;validated:boolean;existing:boolean;revision?:number};
export function StudioStatus({operation,saved,validated,existing,revision}:State){
 const reduced=useReducedMotionPreference(),state=operation??(saved?'saved':validated?'valid':'draft');
 const text=operation==='save'?'Saving…':operation==='validate'?'Checking rules…':operation==='generate'?'Preparing draft…':operation==='loading'?'Loading strategy…':saved?`Saved${revision?` · v${revision}`:''}`:validated?'Rules checked':existing?'Unsaved changes':'Unsaved draft';
 return <div className="studio-file-meta"><small>strategy.json</small><span className="studio-save-status" data-state={state} role="status"><span className="studio-status-mark" aria-hidden="true">{saved&&!operation?<Check size={12}/>:<i/>}</span><AnimatePresence initial={false} mode="wait"><motion.span key={text} initial={reduced?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={reduced?{duration:0}:quickFade}>{text}</motion.span></AnimatePresence></span></div>;
}
type ActionProps={name:string;label:string;busy?:boolean;complete?:boolean;disabled:boolean;primary?:boolean;icon:typeof Save;onClick:()=>void};
function Action({name,label,busy,complete,disabled,primary,icon:Icon,onClick}:ActionProps){
 const reduced=useReducedMotionPreference();
 return <button type="button" className={`design-button${primary?'':' secondary'}${complete?' studio-action-complete':''}`} aria-label={name} title={name==='Run'?'Open backtest setup; the test starts after you choose your settings.':name==='Save'?'Save strategy · Ctrl/Cmd+S':name==='Undo'?'Restore the last saved rules or discard the current suggestion.':'Check these rules without saving or running a backtest.'} aria-busy={!!busy} disabled={disabled} onClick={onClick}>
  <span className="studio-action-symbol" aria-hidden="true"><AnimatePresence initial={false} mode="popLayout"><motion.span key={busy?'working':complete?'done':name} initial={reduced?false:{opacity:0,scale:.7,rotate:-20}} animate={{opacity:1,scale:1,rotate:0}} exit={{opacity:0,scale:.7,rotate:20}} transition={reduced?{duration:0}:surfaceSpring}>
   {busy?<motion.svg width="16" height="16" viewBox="0 0 16 16" fill="none" animate={{rotate:reduced?0:360}} transition={{duration:reduced?0:1,repeat:reduced?0:Infinity,ease:'linear'}}><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity=".25"/><path d="M8 2.5A5.5 5.5 0 0 1 13.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></motion.svg>:complete?<motion.svg width="16" height="16" viewBox="0 0 16 16" fill="none"><motion.path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" initial={reduced?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:reduced?0:.3}}/></motion.svg>:<Icon size={16}/>}</motion.span></AnimatePresence></span><span>{label}</span>
 </button>;
}
export default function StudioActions({operation,saved,validated,busy,onUndo,onRun,onValidate,onSave}:State&{busy:boolean;onUndo:()=>void;onRun:()=>Promise<void>;onValidate:()=>Promise<boolean>;onSave:()=>Promise<unknown>}){
 const [intent,setIntent]=useState('');
 useEffect(()=>{if(!operation)setIntent('');},[operation]);
 const saving=operation==='save'&&intent!=='run';
 return <div className="design-studio-actions">
  <Action name="Undo" label="Undo" disabled={busy} icon={Undo2} onClick={onUndo}/>
  <Action name="Run" label={operation==='save'&&intent==='run'?'Saving…':saved?'Run':'Save & run'} busy={operation==='save'&&intent==='run'} disabled={busy} icon={Play} onClick={()=>{setIntent('run');void onRun();}}/>
  <Action name="Validate" label={operation==='validate'?'Checking…':validated?'Valid':'Validate'} busy={operation==='validate'} complete={validated&&operation!=='validate'} disabled={busy} icon={ShieldCheck} onClick={()=>{setIntent('validate');void onValidate();}}/>
  <Action name="Save" label={saving?'Saving…':saved?'Saved':'Save'} busy={saving} complete={saved&&operation!=='save'} disabled={busy||saved} primary icon={Save} onClick={()=>{setIntent('save');void onSave();}}/>
 </div>;
}
