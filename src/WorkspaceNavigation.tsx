import { useState } from "react";

type Destination = "overview" | "strategies" | "backtests" | "data";
export default function WorkspaceNavigation({active,onNavigate}:{active:string;onNavigate:(page:Destination)=>void;onSettings:()=>void}) {
  const [clicked,setClicked]=useState<{id:string;sequence:number}|null>(null);
  return <nav aria-label="Workspace navigation">{([['overview','Dashboard'],['strategies','Strategies'],['backtests','Backtests'],['data','Data']] as const).map(([id,label])=><button key={id} aria-current={active===id?'page':undefined} onClick={()=>{setClicked(previous=>({id,sequence:(previous?.sequence??0)+1}));onNavigate(id);}}>{clicked?.id===id&&<span key={clicked.sequence} aria-hidden="true" className="nav-click-fill" onAnimationEnd={()=>setClicked(null)}/>}<span className="nav-label">{label}</span></button>)}</nav>;
}
