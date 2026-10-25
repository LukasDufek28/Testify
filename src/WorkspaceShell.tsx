import WorkspaceSidebar from './WorkspaceSidebar';
import useWorkspaceMotion from './useWorkspaceMotion';
import {useState,type ReactNode} from 'react';
import {Menu} from 'lucide-react';
import WorkspaceTopbar,{type WorkspaceSearchProps} from './WorkspaceTopbar';
import './dashboard.css';
import './motion.css';
import './workspace.css';
import './workspace-pages.css';

export type WorkspacePage = 'manual'|'connections'|'overview'|'strategies'|'studio'|'data'|'backtests'|'history'|'results'|'compare'|'validation'|'portfolio'|'runsettings'|'trades';
export default function WorkspaceShell({page,onNavigate,children,accountControls,search}:{page:WorkspacePage;onNavigate:(page:WorkspacePage)=>void;onBackup:()=>Promise<void>;children:ReactNode;accountControls?:ReactNode;search:WorkspaceSearchProps}){
  const {scope}=useWorkspaceMotion(page);const [navOpen,setNavOpen]=useState(false);
  const active=page==='studio'?'strategies':['history','results','compare','validation','portfolio','trades','runsettings'].includes(page)?'backtests':page;
  return <div className="penpot-workspace workspace-shell testify-legacy">
    <button className="design-mobile-menu design-icon-button" aria-label="Open navigation" onClick={()=>setNavOpen(!navOpen)}><Menu size={20}/></button>
    <WorkspaceSidebar active={active} nav={target=>{onNavigate(target);setNavOpen(false);}} navOpen={navOpen} setNavOpen={setNavOpen} accountControls={accountControls}/>
    <main className="design-main" aria-busy={false}><WorkspaceTopbar {...search}/><div ref={scope} data-motion-page={page} className="workspace-content">{children}</div></main>
  </div>;
}
