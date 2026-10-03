import WorkspaceNavigation from "./WorkspaceNavigation";
import WorkspaceBrand from "./WorkspaceBrand";
import "./motion.css";
import { useRef } from "react";
import "./dashboard.css";

type Props = {
  strategyCount: number;
  onNavigate: (page: "studio" | "strategies" | "data" | "backtests") => void;
  onImport: (file: File) => Promise<void>;
  onBackup: () => Promise<void>;
  error: string;
};

export default function EmptyDashboard({ strategyCount, onNavigate, onImport, onBackup, error }: Props) {
  const upload = useRef<HTMLInputElement>(null);
  const settings = useRef<HTMLDialogElement>(null);
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <WorkspaceBrand/>
      <WorkspaceNavigation active="overview" onNavigate={page => { if(page !== "overview") onNavigate(page); }} onSettings={() => settings.current?.showModal()}/>
      <div className="dashboard-sidebar-bottom"><strong>Free workspace</strong><p>Help &amp; getting started</p><button onClick={() => settings.current?.showModal()}>Account</button></div>
    </aside>
    <main className="dashboard-main">
      <header className="dashboard-topbar"><span>Dashboard / Your first strategy starts here</span><span className="dashboard-account">Free account</span></header>
      <div className="dashboard-content">
        <h1>Your first strategy starts here</h1>
        <p className="dashboard-subtitle">Describe an idea, save its rules, then test it on historical data.</p>
        {error && <p className="dashboard-error" role="alert">{error}</p>}
        <section className="dashboard-welcome" aria-labelledby="getting-started-title">
          <span className="dashboard-kicker">GETTING STARTED</span>
          <h2 id="getting-started-title">What would you like to test?</h2>
          <p>{strategyCount ? `You have ${strategyCount} saved ${strategyCount === 1 ? "strategy" : "strategies"}, ready for a first backtest.` : "You do not have any saved strategies yet."}<br />Gemini can help turn your idea into a strategy you can edit and backtest.</p>
          <div className="dashboard-actions"><button className="dashboard-button dashboard-primary testify-primary" onClick={() => onNavigate("studio")}>Create with AI</button><button className="dashboard-button" onClick={() => upload.current?.click()}>Import strategy JSON</button></div>
          <input ref={upload} type="file" accept=".json,application/json" aria-label="Import strategy JSON file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void onImport(file); e.target.value = ""; }} />
        </section>
        <section className="dashboard-steps" aria-label="Getting started steps">
          {[
            ["1 Create a strategy", "Describe rules or import JSON.", "studio"],
            ["2 Choose your data", "Select a market and test period.", "data"],
            ["3 Run and review", "Explore trades and performance.", "backtests"],
          ].map(([title, description, target]) => <article key={title}><h2>{title}</h2><p>{description}</p><button className="dashboard-button" aria-label={`Open this step: ${title}`} onClick={() => onNavigate(target as "studio" | "data" | "backtests")}>Open this step</button></article>)}
        </section>
      </div>
      <footer>Your workspace is saved in this browser.</footer>
    </main>
    <dialog ref={settings} className="dashboard-settings" aria-labelledby="workspace-settings-title">
      <h2 id="workspace-settings-title">Workspace settings</h2><p>Your strategies and backtests are saved in this browser. Export a backup to keep a copy.</p><p>Account sign-in is coming soon.</p>
      <div className="dashboard-actions"><button className="dashboard-button dashboard-primary testify-primary" onClick={() => void onBackup()}>Export backup</button><button className="dashboard-button" onClick={() => settings.current?.close()}>Close</button></div>
    </dialog>
  </div>;
}
