import WorkspaceNavigation from "./WorkspaceNavigation";
import WorkspaceBrand from "./WorkspaceBrand";
import { useRef, type ReactNode } from "react";
import "./dashboard.css";
import "./motion.css";
import "./workspace.css";

export type WorkspacePage = "overview" | "strategies" | "studio" | "data" | "backtests" | "history" | "results" | "compare" | "validation" | "portfolio" | "runsettings" | "trades";
export default function WorkspaceShell({ page, onNavigate, onBackup, children }: { page: WorkspacePage; onNavigate: (page: WorkspacePage) => void; onBackup: () => Promise<void>; children: ReactNode }) {
  const settings = useRef<HTMLDialogElement>(null);
  const active = page === "studio" ? "strategies" : ["history", "results", "compare", "validation", "portfolio"].includes(page) ? "backtests" : page;
  const labels: Record<WorkspacePage, string> = { overview: "Dashboard", strategies: "Strategies", studio: "Strategies / Edit strategy", data: "Data / Market data", backtests: "Backtests / New backtest", history: "Backtests / History", results: "Backtests / Backtest results", compare: "Backtests / Compare backtests", validation: "Backtests / Validation", portfolio: "Backtests / Portfolio", runsettings: "Backtests / Run settings", trades: "Backtests / Trades & chart" };
  return <div className={`dashboard-shell workspace-shell ${page === "studio" ? "workspace-studio" : ""}`}>
    <aside className="dashboard-sidebar"><WorkspaceBrand/>
      <WorkspaceNavigation active={active} onNavigate={onNavigate} onSettings={() => settings.current?.showModal()}/>
      <div className="dashboard-sidebar-bottom"><strong>Free workspace</strong><p>Help &amp; getting started</p><button onClick={() => settings.current?.showModal()}>Account</button></div>
    </aside>
    <main className="dashboard-main"><header className="dashboard-topbar"><span>{labels[page]}</span><span className="dashboard-account">Free account</span></header><div key={page} className="workspace-content">{children}</div><footer>Your workspace is saved in this browser.</footer></main>
    <dialog ref={settings} className="dashboard-settings" aria-labelledby="workspace-settings-title"><h2 id="workspace-settings-title">Workspace settings</h2><p>Your strategies and results are saved in this browser. Export a backup to keep a copy.</p><p>Account sign-in is coming soon.</p><div className="dashboard-actions"><button className="dashboard-button dashboard-primary testify-primary" onClick={() => void onBackup()}>Export backup</button><button className="dashboard-button" onClick={() => settings.current?.close()}>Close</button></div></dialog>
  </div>;
}
