import WorkspaceSidebar from './WorkspaceSidebar';
import useWorkspaceMotion from './useWorkspaceMotion';
import {useState,type ReactNode} from 'react';
import {Menu,Layers} from 'lucide-react';
import {DesignIcon} from './PenpotPrimitives';
import './dashboard.css';
import './motion.css';
import './workspace.css';

export type WorkspacePage = 'manual'|'connections'|'overview'|'strategies'|'studio'|'data'|'backtests'|'history'|'results'|'compare'|'validation'|'portfolio'|'runsettings'|'trades';
export default function WorkspaceShell({page,onNavigate,children,accountControls}:{page:WorkspacePage;onNavigate:(page:WorkspacePage)=>void;onBackup:()=>Promise<void>;children:ReactNode;accountControls?:ReactNode}){
  const {scope}=useWorkspaceMotion(page);const [navOpen,setNavOpen]=useState(false);
  const active=page==='studio'?'strategies':['history','results','compare','validation','portfolio','trades','runsettings'].includes(page)?'backtests':page;
  return <div className="penpot-workspace workspace-shell testify-legacy">
    <button className="design-mobile-menu design-icon-button" aria-label="Open navigation" onClick={()=>setNavOpen(!navOpen)}><Menu size={20}/></button>
    <WorkspaceSidebar active={active} nav={target=>{onNavigate(target);setNavOpen(false);}} navOpen={navOpen} setNavOpen={setNavOpen} accountControls={accountControls}/>
    <main className="design-main"><header className="design-topbar"><DesignIcon icon={Layers}/><span>Testify workspace</span><small>Saved workspace</small></header><div ref={scope} data-motion-page={page} className="workspace-content">{children}</div></main>
  </div>;
}
