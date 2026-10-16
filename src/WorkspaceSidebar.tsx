import {ChartNoAxesCombined,ChevronLeft,Database,House,Square} from 'lucide-react';
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
            className="design-icon-button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <ChevronLeft size={13} />
          </button>
          <nav aria-label="Workspace navigation">
            {[
              ["overview", "Dashboard", House],
              ["backtests", "Backtests", ChartNoAxesCombined],
            ].map(([id, label, Icon]) => {
              void Icon;
              return (
                <button
                  key={id as string}
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => nav(id as WorkspacePage)}
                >
                  <span className="design-icon" aria-hidden="true">
                    <img
                      src={
                        "/design/icon-" +
                        ({
                          overview: "home",
                          backtests: "backtests",
                          strategies: "strategies",
                          data: "data",
                        }[id as string] || "home") +
                        ".svg"
                      }
                      alt=""
                      width="15"
                      height="15"
                    />
                  </span>
                  {label as string}
                </button>
              );
            })}
            <div className="design-subnav">
              {[
                ["backtests", "Overview"],
                ["trades", "Trades & chart"],
                ["runsettings", "Run settings"],
                ["manual", "Manual replay"],
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
              ["strategies", "Strategies", Square],
              ["data", "Data", Database],
            ].map(([id, label, Icon]) => {
              void Icon;
              return (
                <button
                  key={id as string}
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => nav(id as WorkspacePage)}
                >
                  <span className="design-icon" aria-hidden="true">
                    <img
                      src={
                        "/design/icon-" +
                        ({
                          overview: "home",
                          backtests: "backtests",
                          strategies: "strategies",
                          data: "data",
                        }[id as string] || "home") +
                        ".svg"
                      }
                      alt=""
                      width="15"
                      height="15"
                    />
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
            <span>A</span>
            <div>
              Adam V.<small>adam.xxx@gmail.com</small>
            </div>
          </div>}
        </div>
      </aside>);
}
