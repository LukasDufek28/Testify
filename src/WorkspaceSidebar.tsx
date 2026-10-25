import {ChartNoAxesCombined,Database,House,Workflow,X,type LucideIcon} from 'lucide-react';
import {useEffect,useId,useRef,useSyncExternalStore,type ReactNode} from 'react';
import {AnimatePresence,LayoutGroup,motion,useReducedMotion} from 'motion/react';
import {surfaceSpring} from './motion-tokens';
import type {WorkspacePage} from './WorkspaceShell';
import {AssistantLauncher} from './AssistantWorkspace';
const mobileQuery='(max-width:800px)';
const subscribeMobile=(notify:()=>void)=>{const query=matchMedia(mobileQuery);query.addEventListener('change',notify);return()=>query.removeEventListener('change',notify);};
const isMobile=()=>matchMedia(mobileQuery).matches;
export default function WorkspaceSidebar({active,nav,navOpen,setNavOpen,accountControls}:{active:string;nav:(page:WorkspacePage)=>void;navOpen:boolean;setNavOpen:(open:boolean)=>void;accountControls?:ReactNode}) {
const group=useId(),reduced=useReducedMotion(),mobile=useSyncExternalStore(subscribeMobile,isMobile,()=>false);
const sidebar=useRef<HTMLElement>(null);
const close=()=>{setNavOpen(false);document.querySelector<HTMLButtonElement>('.design-mobile-menu')?.focus();};
useEffect(()=>{
 if(!mobile||!navOpen)return;
 const root=sidebar.current,previousOverflow=document.body.style.overflow;
 document.body.style.overflow='hidden';root?.querySelector<HTMLButtonElement>('.design-navigation-close')?.focus();
 const keydown=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();setNavOpen(false);document.querySelector<HTMLButtonElement>('.design-mobile-menu')?.focus();return;}
  if(event.key!=='Tab'||!root)return;
  const items=[...root.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled)')].filter(item=>item.getClientRects().length>0);
  const first=items[0],last=items.at(-1);if(!first||!last)return;
  if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}
 };
 document.addEventListener('keydown',keydown);
 return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=previousOverflow;};
},[mobile,navOpen,setNavOpen]);
return (<><AnimatePresence>{navOpen&&<motion.button type="button" tabIndex={-1} aria-label="Close navigation backdrop" className="design-nav-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.2}} onClick={close}/>}</AnimatePresence><aside ref={sidebar} className={"design-sidebar " + (navOpen ? "open" : "")} inert={mobile&&!navOpen} aria-hidden={mobile&&!navOpen?true:undefined}>
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
            onClick={close}
          >
            <X size={16} />
          </button>
          <LayoutGroup id={group}><nav aria-label="Workspace navigation">
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
                  {active===id&&<motion.span aria-hidden="true" className="design-nav-highlight" layoutId="active-section" transition={reduced?{duration:0}:surfaceSpring}/>}
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
                  {active===id&&<motion.span aria-hidden="true" className="design-nav-highlight" layoutId="active-section" transition={reduced?{duration:0}:surfaceSpring}/>}
                  <span className="design-icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.7}/>
                  </span>
                  {label as string}
                </button>
              );
            })}
          </nav></LayoutGroup>
        </div>
        <div className="design-sidebar-bottom">
          <AssistantLauncher onOpen={()=>setNavOpen(false)}/>
          {accountControls || <div className="design-user">
            <span>G</span>
            <div>
              Guest<small>Temporary workspace</small>
            </div>
          </div>}
        </div>
      </aside></>);
}
