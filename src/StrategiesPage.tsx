import { metricTone } from "./theme";
import AnimatedValue from "./AnimatedValue";
import { useMemo, useRef, useState } from "react";
import { AnimatedSelect } from "./AnimatedControls";
import ConfirmStrategyDelete from "./ConfirmStrategyDelete";
import { latestStrategyRuns } from "./strategyLibrary";
import type { Run, SavedStrategy } from "./types";

const interval = (seconds: number) => seconds < 3600 ? `${seconds / 60}m` : seconds < 86400 ? `${seconds / 3600}h` : `${seconds / 86400}d`;

export type StrategiesPageProps = {
  strategies: SavedStrategy[]; runs: Run[]; loading?: boolean; loadError?: string;
  onRetry: () => Promise<void>; onCreate: () => void;
  onOpen: (id: string) => void; onBacktest: (id: string) => void;
  onDuplicate: (strategy: SavedStrategy) => Promise<void>; onDelete: (id: string) => Promise<void>;
  onImport: (file: File) => Promise<void>; onExport: (ids: string[]) => void;
};

export default function StrategiesPage({ strategies, runs, loading = false, loadError = "", onRetry, onCreate, onOpen, onBacktest, onDuplicate, onDelete, onImport, onExport }: StrategiesPageProps) {
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState<SavedStrategy | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const operationLock = useRef(false);
  const latest = useMemo(() => latestStrategyRuns(runs), [runs]);
  const selectedIds = selected.filter(id => strategies.some(strategy => strategy.id === id));
  const filtered = strategies.filter(strategy => {
    const run = latest.get(strategy.id);
    return `${strategy.name} ${run?.symbol || ""} ${run?.granularity ? interval(run.granularity) : ""}`.toLowerCase().includes(search.trim().toLowerCase()) && (!market || run?.symbol === market);
  });
  async function perform(key: string, operation: () => Promise<void>) {
    if (operationLock.current) return;
    operationLock.current = true; setPending(key); setActionError("");
    try { await operation(); } catch (error) { setActionError(error instanceof Error ? error.message : "Could not complete this action. Try again."); }
    finally { operationLock.current = false; setPending(""); }
  }
  function closeMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }
  const unavailable = loading || !!loadError || !!pending;
  return <>
    <div className="workspace-page-heading"><div><h1>Strategies</h1><p>Build, organize and improve your trading rules.</p></div><button className="dashboard-button dashboard-primary testify-primary" onClick={onCreate} disabled={unavailable}>Create strategy</button></div>
    <div className="strategy-filters">
      <label>Search strategies<input type="search" placeholder="Search by name, market or timeframe" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <AnimatedSelect aria-label="Filter strategies by market" value={market} onChange={event => setMarket(event.target.value)}><option value="">All markets</option>{[...new Set([...latest.values()].map(run => run.symbol))].sort().map(symbol => <option key={symbol}>{symbol}</option>)}</AnimatedSelect>
      <button className="dashboard-button" disabled={unavailable} onClick={() => upload.current?.click()}>{pending === "import" ? "Importing…" : "Import JSON"}</button>
      <button className="dashboard-button" disabled={unavailable || !selectedIds.length} onClick={() => { try { onExport(selectedIds); setActionError(""); } catch (error) { setActionError(String(error)); } }}>Export selected</button>
      <input hidden ref={upload} type="file" accept=".json,application/json" aria-label="Import strategy JSON file" onChange={event => { const file = event.target.files?.[0]; if (file) void perform("import", () => onImport(file)); event.target.value = ""; }} />
    </div>
    {actionError && <div className="banner error" role="alert"><span>{actionError}</span><button onClick={() => setActionError("")}>Dismiss</button></div>}
    {loading ? <section className="workspace-panel strategy-loading" role="status" aria-live="polite">Loading your strategies…<div className="strategy-skeleton-grid" aria-hidden="true">{[0,1,2].map(key => <div key={key}/>)}</div></section> : loadError ?
      <section className="workspace-panel workspace-empty" role="alert"><h2>Could not load your strategies</h2><p>{loadError}</p><button className="dashboard-button" onClick={() => void perform("retry", onRetry)} disabled={!!pending}>{pending === "retry" ? "Retrying…" : "Try again"}</button></section> : <>
      {!!strategies.length && <div className="strategy-library-count" role="status"><span>{filtered.length} of {strategies.length} strategies</span><button className="dashboard-button strategy-clear-selection" style={{visibility:selectedIds.length?'visible':'hidden'}} disabled={!selectedIds.length} tabIndex={selectedIds.length?0:-1} onClick={() => setSelected([])}>Clear selection ({selectedIds.length})</button></div>}
      <div className="strategy-grid" aria-busy={!!pending}>{filtered.map((strategy, index) => {
        const run = latest.get(strategy.id);
        return <article className="workspace-panel strategy-card" key={strategy.id} aria-label={strategy.name} style={{ animationDelay: `${Math.min(index, 5) * 80}ms` }}>
          <div className="strategy-card-title"><h2>{strategy.name}</h2><input type="checkbox" aria-label={`Select ${strategy.name}`} checked={selectedIds.includes(strategy.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, strategy.id] : ids.filter(id => id !== strategy.id))}/></div>
          <p>{run ? `${run.symbol} · ${run.granularity ? interval(run.granularity) : "Historical data"}` : "Market and timeframe selected when testing"}</p>
          <p className="strategy-updated">Updated {new Date(strategy.updatedAt).toLocaleDateString()}</p>
          <div className="strategy-last-test"><span>Last test</span><strong className={run && run.metrics.netReturnPct > 0 ? "positive" : run && run.metrics.netReturnPct < 0 ? "negative" : ""}><AnimatedValue tone={run?metricTone("Return",run.metrics.netReturnPct):undefined} value={run ? `${run.metrics.netReturnPct >= 0 ? "+" : ""}${run.metrics.netReturnPct.toFixed(1)}%` : "Not tested"}/></strong></div>
          <div className="strategy-card-actions">
            <button className="dashboard-button" disabled={!!pending} onClick={() => onOpen(strategy.id)}>Open</button>
            <button className="dashboard-button" disabled={!!pending} onClick={() => void perform(strategy.id, () => onDuplicate(strategy))}>{pending === strategy.id ? "Duplicating…" : "Duplicate"}</button>
            <details onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
              <summary className="dashboard-button" aria-label={`More actions for ${strategy.name}`}>More <span aria-hidden="true">▾</span></summary>
              <div className="strategy-menu">
                <button disabled={!!pending} onClick={event => { closeMenu(event); onBacktest(strategy.id); }}>New backtest</button>
                <button disabled={!!pending} onClick={event => { closeMenu(event); try { onExport([strategy.id]); } catch (error) { setActionError(String(error)); } }}>Export JSON</button>
                <button disabled={!!pending} onClick={event => { closeMenu(event); setDeleting(strategy); }}>Delete strategy</button>
              </div>
            </details>
          </div>
        </article>;
      })}</div>
      {!filtered.length && <section className="workspace-panel workspace-empty"><h2>{strategies.length ? "No matching strategies" : "Your first strategy starts here"}</h2><p>{strategies.length ? "Try another name, market or timeframe." : "Create a strategy with AI, or import your rules as JSON."}</p>{strategies.length ? <button className="dashboard-button" onClick={() => { setSearch(""); setMarket(""); }}>Clear filters</button> : <button className="dashboard-button dashboard-primary testify-primary" disabled={!!pending} onClick={onCreate}>Create strategy</button>}</section>}
    </>}
    {deleting && <ConfirmStrategyDelete strategy={deleting} onDelete={onDelete} onClose={() => setDeleting(null)} />}
  </>;
}
