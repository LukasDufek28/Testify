import {ChartNoAxesCombined,Database,House,Workflow,X,type LucideIcon} from 'lucide-react';
import type {ReactNode} from 'react';
import type {WorkspacePage} from './WorkspaceShell';
import {AssistantLauncher} from './AssistantWorkspace';
export default function WorkspaceSidebar({active,nav,navOpen,setNavOpen,accountControls}:{active:string;nav:(page:WorkspacePage)=>void;navOpen:boolean;setNavOpen:(open:boolean)=>void;accountControls?:ReactNode}) {
return (      <aside className={"design-sidebar " + (navOpen ? "open" : "")}>
        <div className="design-sidebar-top">
          <a
            className="design-brand"
            href="#"
            aria-label="Back to Testify home"
          >
            TESTIFY
          </a>
          <button
            className="design-icon-button design-navigation-close"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <X size={16} />
          </button>
          <nav aria-label="Workspace navigation">
            {[
              ["overview", "Dashboard", House],
              ["backtests", "Backtests", ChartNoAxesCombined],
            ].map(([id, label, icon]) => {
              const Icon=icon as LucideIcon;
              return (
                <button
                  key={id as string}
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => nav(id as WorkspacePage)}
                >
                  <span className="design-icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.7}/>
                  </span>
                  {label as string}
                </button>
              );
            })}
            <div className="design-subnav">
              {[
                ["backtests", "Overview"],
                ["trades", "Trades & chart"],
                ["runsettings", "Run backtest"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-current={location.hash === "#/app/" + id ? "page" : undefined}
                  onClick={() => nav(id as WorkspacePage)}
                >
                  {label}
                </button>
              ))}
            </div>
            {[
              ["strategies", "Strategies", Workflow],
              ["data", "Data", Database],
            ].map(([id, label, icon]) => {
              const Icon=icon as LucideIcon;
              return (
                <button
                  key={id as string}
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => nav(id as WorkspacePage)}
                >
                  <span className="design-icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.7}/>
                  </span>
                  {label as string}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="design-sidebar-bottom">
          <AssistantLauncher/>
          {accountControls || <div className="design-user">
            <span>G</span>
            <div>
              Guest<small>Temporary workspace</small>
            </div>
          </div>}
        </div>
      </aside>);
}
