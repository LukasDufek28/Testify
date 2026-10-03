import { useRef, useState, type ReactNode } from "react";
import "./dashboard.css";
import "./motion.css";
import "./workspace.css";

export type WorkspacePage = "overview" | "strategies" | "studio" | "data" | "backtests" | "history" | "results" | "compare" | "validation" | "portfolio";
export default function WorkspaceShell({ page, onNavigate, onBackup, children }: { page: WorkspacePage; onNavigate: (page: WorkspacePage) => void; onBackup: () => Promise<void>; children: ReactNode }) {
  const [clicked, setClicked] = useState<{id: string; sequence: number} | null>(null);
  const settings = useRef<HTMLDialogElement>(null);
  const active = page === "studio" ? "strategies" : ["history", "results", "compare", "validation", "portfolio"].includes(page) ? "backtests" : page;
  const labels: Record<WorkspacePage, string> = { overview: "Dashboard", strategies: "Strategies", studio: "Strategies / Edit strategy", data: "Data / Market data", backtests: "Backtests / New backtest", history: "Backtests / History", results: "Backtests / Backtest results", compare: "Backtests / Compare backtests", validation: "Backtests / Validation", portfolio: "Backtests / Portfolio" };
  return <div className={`dashboard-shell workspace-shell ${page === "studio" ? "workspace-studio" : ""}`}>
    <aside className="dashboard-sidebar"><a href="#" aria-label="Back to Testify home"><img src="/testify-logo.png" alt="Testify" width="150" height="50" /></a><span className="dashboard-brand-caption">BACKTESTING WORKSPACE</span>
      <nav aria-label="Workspace navigation">{([['overview','Dashboard'],['strategies','Strategies'],['backtests','Backtests'],['data','Data']] as const).map(([id,label]) => <button key={id} aria-current={active === id ? "page" : undefined} onClick={() => { setClicked(previous => ({id, sequence: (previous?.sequence ?? 0) + 1})); onNavigate(id); }}>{active === id && clicked?.id === id && <span key={clicked.sequence} aria-hidden="true" className="nav-click-fill"/>}<span className="nav-label">{label}</span></button>)}<button onClick={() => { setClicked(previous => ({id: "settings", sequence: (previous?.sequence ?? 0) + 1})); settings.current?.showModal(); }}>{clicked?.id === "settings" && <span key={clicked.sequence} aria-hidden="true" className="nav-click-fill"/>}<span className="nav-label">Settings</span></button></nav>
      <div className="dashboard-sidebar-bottom"><strong>Free workspace</strong><p>Help &amp; getting started</p><button onClick={() => settings.current?.showModal()}>Account</button></div>
    </aside>
    <main className="dashboard-main"><header className="dashboard-topbar"><span>{labels[page]}</span><span className="dashboard-account">Free account</span></header><div key={page} className="workspace-content">{children}</div><footer>Your workspace is saved in this browser.</footer></main>
    <dialog ref={settings} className="dashboard-settings" aria-labelledby="workspace-settings-title"><h2 id="workspace-settings-title">Workspace settings</h2><p>Your strategies and results are saved in this browser. Export a backup to keep a copy.</p><p>Account sign-in is coming soon.</p><div className="dashboard-actions"><button className="dashboard-button dashboard-primary testify-primary" onClick={() => void onBackup()}>Export backup</button><button className="dashboard-button" onClick={() => settings.current?.close()}>Close</button></div></dialog>
  </div>;
}
