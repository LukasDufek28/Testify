import { Children, isValidElement, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import "./controls.css";

function usePopup() {
  const [open,setOpen]=useState(false);
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{if(open){setMounted(true);return;}const timer=setTimeout(()=>setMounted(false),120);return()=>clearTimeout(timer);},[open]);
  const trigger=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:0,top:0,width:280,maxHeight:360});
  useLayoutEffect(()=>{if(!open)return; const place=()=>{const r=trigger.current?.getBoundingClientRect();if(!r)return;const width=Math.min(Math.max(r.width,280),innerWidth-24);const below=innerHeight-r.bottom-16;const above=r.top-16;const height=Math.min(360,Math.max(below,above));setPosition({left:Math.max(12,Math.min(r.left,innerWidth-width-12)),top:below>=Math.min(360,above)?r.bottom+8:Math.max(12,r.top-height-8),width,maxHeight:height});};place();const dismiss=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};addEventListener('pointerdown',dismiss);addEventListener('keydown',escape);addEventListener('resize',place);addEventListener('scroll',place,true);return()=>{removeEventListener('pointerdown',dismiss);removeEventListener('keydown',escape);removeEventListener('resize',place);removeEventListener('scroll',place,true);};},[open]);
  return {open,mounted,setOpen,trigger,panel,position};
}
const optionText = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement(child) ? optionText((child.props as {children?:ReactNode}).children) : String(child)).join("");
export function AnimatedSelect({children,value,onChange,disabled,"aria-label":label}:SelectHTMLAttributes<HTMLSelectElement>) {
  const popup=usePopup(),id=useId();
  const [search,setSearch]=useState(''),[active,setActive]=useState(-1);
  const options=Children.toArray(children).filter(isValidElement).map(child=>{
    const p=child.props as {value?:string|number;children?:ReactNode;disabled?:boolean};
    return {value:String(p.value??optionText(p.children)),label:optionText(p.children),disabled:p.disabled};
  });
  const filtered=options.filter(o=>o.label.toLowerCase().includes(search.toLowerCase()));
  const selected=options.find(o=>o.value===String(value));
  const activeId=popup.open&&filtered[active]&&!filtered[active].disabled?`${id}-${active}`:undefined;
  useEffect(()=>{if(popup.open)popup.panel.current?.querySelector('.keyboard-active')?.scrollIntoView({block:'nearest'});},[active,search,popup.open,popup.mounted]);
  function choose(v:string){
    if(disabled||!options.some(o=>o.value===v&&!o.disabled))return;
    onChange?.({target:{value:v}} as ChangeEvent<HTMLSelectElement>);
    popup.setOpen(false);popup.trigger.current?.focus();
  }
  function show(){
    setSearch('');
    const current=options.findIndex(o=>o.value===String(value)&&!o.disabled);
    setActive(current>=0?current:options.findIndex(o=>!o.disabled));
    popup.setOpen(true);
  }
  function keyDown(e:ReactKeyboardEvent<HTMLElement>){
    if(e.key==='Tab'&&popup.open){popup.setOpen(false);popup.trigger.current?.focus();return;}
    if(!popup.open){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show();}return;}
    if(e.key==='Enter'){e.preventDefault();if(filtered[active])choose(filtered[active].value);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    e.preventDefault();
    const enabled=filtered.flatMap((o,i)=>o.disabled?[]:[i]);
    if(!enabled.length){setActive(-1);return;}
    const position=enabled.indexOf(active);
    setActive(e.key==='Home'?enabled[0]:e.key==='End'?enabled.at(-1)!:enabled[Math.max(0,Math.min(enabled.length-1,position+(e.key==='ArrowDown'?1:-1)))]);
  }
  return <div className="custom-control">
    <button type="button" ref={popup.trigger} role="combobox" aria-label={label} aria-expanded={popup.open} aria-controls={id} aria-haspopup="listbox" aria-activedescendant={activeId} disabled={disabled} className="control-trigger" onClick={()=>popup.open?popup.setOpen(false):show()} onKeyDown={keyDown}>
      <span className="control-value">{selected?.label||'Choose an option'}</span><span aria-hidden="true" className={popup.open?'control-chevron open':'control-chevron'}>⌄</span>
    </button>
    {popup.mounted&&createPortal(<div ref={popup.panel} aria-hidden={!popup.open} className={`control-popup${popup.open?'':' closing'}`} style={popup.position}>
      {options.length>8&&<input autoFocus type="search" role="combobox" aria-label={`Search ${label||'options'}`} aria-controls={id} aria-expanded={popup.open} aria-activedescendant={activeId} placeholder="Search…" value={search} onChange={e=>{const query=e.target.value;setSearch(query);setActive(options.filter(o=>o.label.toLowerCase().includes(query.toLowerCase())).findIndex(o=>!o.disabled));}} onKeyDown={keyDown}/>}
      <div role="listbox" id={id} aria-label={label} className="control-options">
        {filtered.map((o,i)=><button type="button" tabIndex={-1} role="option" aria-label={o.label} id={`${id}-${i}`} data-value={o.value} aria-selected={o.value===String(value)} disabled={o.disabled} className={i===active&&!o.disabled?'keyboard-active':''} key={o.value} onClick={()=>choose(o.value)}>{o.label}{o.value===String(value)&&<span aria-hidden="true">✓</span>}</button>)}
        {!filtered.length&&<p role="status">No matches</p>}
      </div>
    </div>,document.body)}
  </div>;
}
export function DateTimePicker({value,onChange,"aria-label":label}:InputHTMLAttributes<HTMLInputElement>) {
  const popup=usePopup();const parsed=new Date(String(value));const valid=Number.isFinite(parsed.getTime())?parsed:new Date();const [month,setMonth]=useState(new Date(valid.getFullYear(),valid.getMonth(),1));
  useEffect(()=>{if(popup.open&&popup.mounted){const day=popup.panel.current?.querySelector<HTMLButtonElement>(".calendar-grid button[aria-pressed=true]") || popup.panel.current?.querySelector<HTMLButtonElement>(".calendar-grid button");day?.focus();}},[popup.open,popup.mounted]);
  const update=(date:Date)=>{const pad=(n:number)=>String(n).padStart(2,'0');onChange?.({target:{value:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`}} as ChangeEvent<HTMLInputElement>);};
  const first=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  return <div className="custom-control"><button type="button" className="control-trigger" ref={popup.trigger} aria-label={label} aria-haspopup="dialog" aria-expanded={popup.open} onClick={()=>{setMonth(new Date(valid.getFullYear(),valid.getMonth(),1));popup.setOpen(!popup.open);}}>{valid.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} · {valid.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})}<span>▦</span></button>{popup.mounted&&createPortal(<div aria-hidden={!popup.open} className={`control-popup calendar-popup${popup.open ? "" : " closing"}`} ref={popup.panel} style={popup.position} role="dialog" aria-label={`${label} calendar`} onKeyDown={e=>{if(e.key!=="Tab")return;const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)"));const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}><div className="calendar-heading"><button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><strong>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</strong><button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div><div className="calendar-grid">{['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=><span key={d}>{d}</span>)}{Array.from({length:first},(_,i)=><span key={`blank${i}`}/>)}{Array.from({length:count},(_,i)=>i+1).map(d=><button type="button" key={d} aria-label={new Date(month.getFullYear(),month.getMonth(),d).toLocaleDateString('en-CA')} aria-pressed={d===valid.getDate()&&month.getMonth()===valid.getMonth()&&month.getFullYear()===valid.getFullYear()} onClick={()=>{const date=new Date(valid);date.setFullYear(month.getFullYear(),month.getMonth(),d);update(date);}}>{d}</button>)}</div><div className="calendar-time"><span>Time</span><input aria-label={`${label} hour`} type="number" min="0" max="23" value={valid.getHours()} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<=23){const date=new Date(valid);date.setHours(n);update(date);}}}/><span>:</span><input aria-label={`${label} minute`} type="number" min="0" max="59" value={valid.getMinutes()} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<=59){const date=new Date(valid);date.setMinutes(n);update(date);}}}/></div><div className="calendar-footer"><button type="button" onClick={()=>{update(new Date());}}>Today</button><button type="button" onClick={()=>{popup.setOpen(false);popup.trigger.current?.focus();}}>Done</button></div></div>,document.body)}</div>;
}

export function RangeSlider({value,min=30,max=80,...props}:InputHTMLAttributes<HTMLInputElement>) {
  const [held,setHeld]=useState(false);
  useEffect(()=>{const release=()=>setHeld(false);addEventListener('pointerup',release);addEventListener('pointercancel',release);return()=>{removeEventListener('pointerup',release);removeEventListener('pointercancel',release);};},[]);
  const progress=Math.max(0,Math.min(100,(Number(value)-Number(min))/(Number(max)-Number(min))*100));
  return <span className={`range-control${held?' held':''}`}><span className="range-track"><span style={{width:`${progress}%`}}/></span><span className="range-thumb" style={{left:`calc(${progress}% + ${9-progress*.18}px)`}}/><input {...props} type="range" min={min} max={max} value={value} onPointerDown={()=>setHeld(true)} onBlur={()=>setHeld(false)}/></span>;
}
