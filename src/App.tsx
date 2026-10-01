import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import ReactECharts from "echarts-for-react";
import { Activity, BarChart3, Beaker, BrainCircuit, ChartNoAxesCombined, ChevronRight, Code2, Database, Download, FileUp, FlaskConical, History, Layers3, Play, Plus, Save, ShieldCheck, Square, Trash2 } from "lucide-react";
import { localStore } from "./storage";
import { exampleStrategy, parseStrategy, type BacktestSettings, type Dataset, type Run, type SavedStrategy } from "./types";
import { generateStrategy, GEMINI_MODEL } from "./gemini";
import { combinePortfolio } from "./portfolio";

type Page = "overview" | "data" | "studio" | "backtests" | "history" | "validation" | "portfolio";
const menu: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: ChartNoAxesCombined },
  { id: "data", label: "Market data", icon: Database },
  { id: "studio", label: "Strategy studio", icon: Code2 },
  { id: "backtests", label: "Backtests", icon: BarChart3 },
  { id: "history", label: "History", icon: History },
  { id: "validation", label: "Validation", icon: Beaker },
  { id: "portfolio", label: "Portfolio lab", icon: Layers3 },
];
const fmt = (n: number, digits = 2) => Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const pct = (n: number) => `${n >= 0 ? "+" : ""}${fmt(n)}%`;
const date = (seconds: number) => new Date(seconds * 1000).toLocaleString();
const dateInput = (seconds: number) => { const d = new Date(seconds * 1000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const timeframeName = (seconds: number) => ({ 60: "1m", 300: "5m", 900: "15m", 3600: "1h", 21600: "6h", 86400: "1d" } as Record<number, string>)[seconds] || `${seconds}s`;
const intervals: [number, string][] = [[60, "1 minute"], [300, "5 minutes"], [900, "15 minutes"], [3600, "1 hour"], [21600, "6 hours"], [86400, "1 day"]];
const TESTER_OPTIONS_KEY = "testify-tester-options-v1";
type TesterOptions = { strategyId: string; market: string; selectedMarkets: string[]; granularity: number; runName: string; capital: number; feeBps: number; slippageBps: number; start: string; end: string; splitPct: number };
function readTesterOptions(): Partial<TesterOptions> {
  try {
    const raw = localStorage.getItem(TESTER_OPTIONS_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const options: Partial<TesterOptions> = {};
    if (typeof saved.strategyId === "string") options.strategyId = saved.strategyId;
    if (typeof saved.market === "string" && /^[A-Z0-9]{2,20}-(USD|USDT)$/.test(saved.market)) options.market = saved.market;
    if (Array.isArray(saved.selectedMarkets)) options.selectedMarkets = [...new Set(saved.selectedMarkets.filter((symbol): symbol is string => typeof symbol === "string" && /^[A-Z0-9]{2,20}-(USD|USDT)$/.test(symbol)))];
    if (typeof saved.granularity === "number" && intervals.some(([value]) => value === saved.granularity)) options.granularity = saved.granularity;
    if (typeof saved.runName === "string") options.runName = saved.runName;
    for (const key of ["capital", "feeBps", "slippageBps"] as const) { const value = saved[key]; if (typeof value === "number" && Number.isFinite(value) && value >= 0) options[key] = value; }
    for (const key of ["start", "end"] as const) { const value = saved[key]; if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) options[key] = value; }
    if (typeof saved.splitPct === "number" && saved.splitPct >= 30 && saved.splitPct <= 80) options.splitPct = saved.splitPct;
    return options;
  } catch { return {}; }
}
function Chart({ curves }: { curves: { name: string; points: { time: number; equity: number }[] }[] }) {
  if (!curves.length || !curves.some((c) => c.points.length)) return <div className="chart-empty">Run a backtest to see an equity curve.</div>;
  return <ReactECharts style={{ height: 320 }} option={{ backgroundColor: "transparent", animation: false, tooltip: { trigger: "axis", backgroundColor: "#19303a", borderColor: "#385863", textStyle: { color: "#e5f4f2" } }, legend: { top: 0, textStyle: { color: "#9ab2bd" } }, grid: { left: 70, right: 24, top: 48, bottom: 45 }, xAxis: { type: "time", axisLabel: { color: "#8fa7b3" } }, yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: "#29424d" } }, axisLabel: { color: "#8fa7b3" } }, series: curves.map((c, i) => ({ name: c.name, type: "line", showSymbol: false, lineStyle: { width: 2, color: ["#55e2b7", "#f3b86d", "#8eb4ff", "#db9fff"][i % 4] }, itemStyle: { color: ["#55e2b7", "#f3b86d", "#8eb4ff", "#db9fff"][i % 4] }, data: c.points.filter((_, j) => j % Math.max(1, Math.ceil(c.points.length / 1800)) === 0).map((p) => [p.time * 1000, p.equity]) })) }} />;
}
function PriceChart({ dataset }: { dataset: Dataset }) {
  const stride = Math.max(1, Math.ceil(dataset.bars.length / 1200));
  return <ReactECharts style={{ height: 270 }} option={{ backgroundColor: "transparent", animation: false, tooltip: { trigger: "axis" }, grid: { left: 65, right: 20, top: 20, bottom: 42 }, xAxis: { type: "time", axisLabel: { color: "#8fa7b3" } }, yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: "#29424d" } }, axisLabel: { color: "#8fa7b3" } }, series: [{ type: "line", showSymbol: false, lineStyle: { color: "#55e2b7", width: 2 }, data: dataset.bars.filter((_, i) => i % stride === 0).map((b) => [b.time * 1000, b.close]) }] }} />;
}
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>; }
function download(name: string, content: string, type = "application/json") { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const cancelled = () => new DOMException("Backtest cancelled.", "AbortError");
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(cancelled());
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(cancelled()); };
  signal?.addEventListener("abort", onAbort, { once: true });
});
async function fetchWithRateLimitRetry(input: RequestInfo | URL, init?: RequestInit, onWait?: (seconds: number, attempt: number) => void): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(input, init);
    if (response.status !== 429 || attempt >= 6) return response;
    const header = Number(response.headers.get("Retry-After"));
    const seconds = Number.isFinite(header) && header > 0 ? Math.max(60, Math.min(300, header)) : 60;
    onWait?.(seconds, attempt);
    await pause(seconds * 1000, init?.signal || undefined);
  }
}
const CANDLES_PER_REQUEST = 2392;
async function loadOnlineBars(symbol: string, granularity: number, start: number, end: number, signal?: AbortSignal, onProgress?: (loaded: number, estimated: number) => void): Promise<Dataset["bars"]> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("Choose a valid historical date range.");
  const byTime = new Map<number, Dataset["bars"][number]>();
  const estimated = Math.ceil((end - start) / granularity);
  for (let cursor = start; cursor < end; cursor += CANDLES_PER_REQUEST * granularity) {
    if (signal?.aborted) throw cancelled();
    const to = Math.min(end, cursor + CANDLES_PER_REQUEST * granularity);
    const query = new URLSearchParams({ product: symbol, granularity: String(granularity), start: String(cursor), end: String(to) });
    const response = await fetchWithRateLimitRetry(`/api/candles?${query}`, { signal }, () => onProgress?.(byTime.size, estimated));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load candles.");
    for (const bar of data.bars as Dataset["bars"]) byTime.set(bar.time, bar);
    onProgress?.(byTime.size, estimated);
    if (to < end) await pause(500, signal);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
function execute(dataset: Dataset, strategy: ReturnType<typeof parseStrategy>, settings: BacktestSettings, strategyId: string, name: string, signal?: AbortSignal): Promise<Run> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { signal?.removeEventListener("abort", onAbort); worker.terminate(); };
    const onAbort = () => { cleanup(); reject(cancelled()); };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; run?: Run; error?: string }>) => { cleanup(); event.data.ok && event.data.run ? resolve(event.data.run) : reject(new Error(event.data.error || "Backtest failed.")); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Backtest worker failed.")); };
    worker.postMessage({ dataset, strategy, settings, strategyId, name });
  });
}

export default function App() {
  const [savedTesterOptions] = useState(readTesterOptions);
  const [page, setPage] = useState<Page>("overview");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [strategyId, setStrategyId] = useState(savedTesterOptions.strategyId || "");
  const [runId, setRunId] = useState("");
  const [source, setSource] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [market, setMarket] = useState(savedTesterOptions.market || "BTC-USD");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(savedTesterOptions.selectedMarkets ?? ["BTC-USD"]);
  const [marketSearch, setMarketSearch] = useState("");
  const [granularity, setGranularity] = useState(savedTesterOptions.granularity || 3600);
  const [historyStart, setHistoryStart] = useState(dateInput(Math.floor(Date.now() / 1000) - 14 * 86400));
  const [historyEnd, setHistoryEnd] = useState(dateInput(Math.floor(Date.now() / 1000)));
  const [idea, setIdea] = useState("");
  const [runName, setRunName] = useState(savedTesterOptions.runName ?? "New research run");
  const [capital, setCapital] = useState(savedTesterOptions.capital ?? 10000);
  const [feeBps, setFeeBps] = useState(savedTesterOptions.feeBps ?? 2);
  const [slippageBps, setSlippageBps] = useState(savedTesterOptions.slippageBps ?? 1);
  const [useMt5Spread] = useState(false);
  const [start, setStart] = useState(savedTesterOptions.start || dateInput(Math.floor(Date.now() / 1000) - 14 * 86400));
  const [end, setEnd] = useState(savedTesterOptions.end || dateInput(Math.floor(Date.now() / 1000)));
  const [splitPct, setSplitPct] = useState(savedTesterOptions.splitPct ?? 70);
  const [validation, setValidation] = useState<{ train: Run; holdout: Run } | null>(null);
  const [portfolioIds, setPortfolioIds] = useState<string[]>([]);
  const [portfolioAll, setPortfolioAll] = useState(() => { try { return localStorage.getItem("testify-portfolio-all") === "true"; } catch { return false; } });
  const [portfolioDisplayRunId, setPortfolioDisplayRunId] = useState("");
  const [portfolioNameFilter, setPortfolioNameFilter] = useState("");
  const [portfolioMode, setPortfolioMode] = useState<"overlay" | "combined">("overlay");
  const [runProgress, setRunProgress] = useState("");
  const backtestAbort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedDataset = datasets.find((d) => d.id === datasetId);
  const selectedStrategy = strategies.find((s) => s.id === strategyId);
  const selectedRun = runs.find((r) => r.id === runId);
  const selectedPortfolio = useMemo(() => runs.filter((r) => portfolioAll || portfolioIds.includes(r.id)), [runs, portfolioIds, portfolioAll]);
  const matchingRunNames = useMemo(() => runs.filter((r) => r.name.toLowerCase().includes(portfolioNameFilter.trim().toLowerCase())), [runs, portfolioNameFilter]);
  const activeDisplayRunId = runs.some((r) => r.id === portfolioDisplayRunId) ? portfolioDisplayRunId : "";
  const displayedPortfolio = useMemo(() => activeDisplayRunId ? runs.filter((r) => r.id === activeDisplayRunId) : portfolioNameFilter.trim() ? [] : selectedPortfolio, [runs, selectedPortfolio, activeDisplayRunId, portfolioNameFilter]);
  const combinedPortfolio = useMemo(() => combinePortfolio(displayedPortfolio), [displayedPortfolio]);
  const visibleMarkets = useMemo(() => markets.filter((symbol) => symbol.toLowerCase().includes(marketSearch.trim().toLowerCase())), [markets, marketSearch]);
  const storageSize = useMemo(() => datasets.reduce((sum, d) => sum + d.bars.length, 0), [datasets]);

  async function refresh() {
    const [ds, ss, rs] = await Promise.all([localStore.datasets(), localStore.strategies(), localStore.runs()]);
    ds.sort((a, b) => b.importedAt - a.importedAt); ss.sort((a, b) => b.updatedAt - a.updatedAt); rs.sort((a, b) => b.createdAt - a.createdAt);
    setDatasets(ds); setStrategies(ss); setRuns(rs);
    setDatasetId((current) => ds.some((d) => d.id === current) ? current : ds[0]?.id || "");
    setStrategyId((current) => ss.some((s) => s.id === current) ? current : ss[0]?.id || "");
    setRunId((current) => rs.some((r) => r.id === current) ? current : rs[0]?.id || "");
  }
  useEffect(() => { void (async () => { try { const ss = await localStore.strategies(); if (!ss.length) await localStore.putStrategy({ id: "sample-sma", name: exampleStrategy.name, source: JSON.stringify(exampleStrategy, null, 2), updatedAt: Date.now() }); await refresh(); } catch (e) { setError(String(e)); } })(); }, []);
  useEffect(() => {
    const options: TesterOptions = { strategyId, market, selectedMarkets, granularity, runName, capital, feeBps, slippageBps, start, end, splitPct };
    try { localStorage.setItem(TESTER_OPTIONS_KEY, JSON.stringify(options)); } catch { /* The form still works when browser storage is unavailable. */ }
  }, [strategyId, market, selectedMarkets, granularity, runName, capital, feeBps, slippageBps, start, end, splitPct]);
  useEffect(() => { try { localStorage.setItem("testify-portfolio-all", String(portfolioAll)); } catch { /* Selection still works for this visit. */ } }, [portfolioAll]);
  useEffect(() => { void (async () => { try { const response = await fetch("/api/markets"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load markets."); setMarkets(data.markets.map((m: { id: string }) => m.id)); } catch (e) { message(e); } })(); }, []);
  useEffect(() => { if (selectedStrategy) setSource(selectedStrategy.source); }, [selectedStrategy?.id]);
  function message(e: unknown) { setError(e instanceof Error ? e.message : String(e)); setNotice(""); }
  async function loadCrypto() {
    setBusy("data"); setError("");
    try {
      const bars = await loadOnlineBars(market, granularity, Date.parse(historyStart) / 1000, Date.parse(historyEnd) / 1000, undefined, (loaded, estimated) => setNotice(`Loading ${market}: ${loaded.toLocaleString()} of about ${estimated.toLocaleString()} candles…`));
      if (bars.length < 20) throw new Error("This market has too few candles in the selected period. Try a wider range.");
      const dataset: Dataset = { id: crypto.randomUUID(), symbol: market, fileName: `Coinbase · ${granularity / 60}m`, importedAt: Date.now(), utcOffset: 0, point: 0, bars, skipped: 0 };
      await localStore.putDataset(dataset); await refresh(); setDatasetId(dataset.id);
      setNotice(`Loaded ${dataset.bars.length.toLocaleString()} ${market} candles from Coinbase.`);
    } catch (e) { message(e); } finally { setBusy(""); }
  }
  async function saveStrategy() {
    setError("");
    try { const parsed = parseStrategy(source); const id = strategyId || crypto.randomUUID(); await localStore.putStrategy({ id, name: parsed.name, source: JSON.stringify(parsed, null, 2), updatedAt: Date.now() }); await refresh(); setStrategyId(id); setSource(JSON.stringify(parsed, null, 2)); setNotice(`Saved ${parsed.name} in this browser.`); } catch (e) { message(e); }
  }
  async function askGemini() {
    setBusy("gemini"); setError("");
    try { const { strategy, model } = await generateStrategy(idea); setSource(JSON.stringify(strategy, null, 2)); setStrategyId(""); setNotice(`${model} created a draft. Review and save it before testing.`); } catch (e) { message(e); } finally { setBusy(""); }
  }
  function settings(): BacktestSettings { return { capital, feeBps, slippageBps, useMt5Spread, start: Date.parse(start) / 1000, end: Date.parse(end) / 1000 }; }
  function onlineDataset(symbol = market): Dataset { return { id: "online", symbol, fileName: `Coinbase · ${granularity / 60}m`, importedAt: Date.now(), utcOffset: 0, point: 0, bars: [], skipped: 0 }; }
  function changeGranularity(value: number) {
    setGranularity(value);
  }
  function cancelBacktest() { backtestAbort.current?.abort(); setRunProgress("Cancelling"); }
  async function runTest() {
    if (!selectedStrategy) return message("Choose a saved strategy.");
    if (!selectedMarkets.length) return message("Check at least one market.");
    setBusy("backtest"); setError("");
    const controller = new AbortController();
    backtestAbort.current = controller;
    const completed: Run[] = [];
    const failures: string[] = [];
    try {
      const strategy = parseStrategy(selectedStrategy.source);
      const assumptions = settings();
      const chosen = [...selectedMarkets];
      for (const [index, symbol] of chosen.entries()) {
        if (controller.signal.aborted) break;
        if (index) await pause(1000, controller.signal);
        setRunProgress(`${index + 1} of ${chosen.length}: ${symbol}`);
        try {
          const name = runName.trim() || "Research run";
          const bars = await loadOnlineBars(symbol, granularity, assumptions.start, assumptions.end, controller.signal, (loaded, estimated) => setRunProgress(`${index + 1} of ${chosen.length}: ${symbol} · ${loaded.toLocaleString()} / ~${estimated.toLocaleString()} candles`));
          if (bars.length < 20) throw new Error("At least 20 candles are needed for a backtest.");
          setRunProgress(`${index + 1} of ${chosen.length}: ${symbol} · calculating`);
          const run = await execute({ ...onlineDataset(symbol), bars }, strategy, assumptions, selectedStrategy.id, name, controller.signal);
          if (controller.signal.aborted) break;
          run.granularity = granularity;
          await localStore.putRun(run);
          completed.push(run);
          setRunId(run.id);
          await refresh();
        } catch (error) { if (controller.signal.aborted) break; failures.push(`${symbol}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (completed.length) {
        setRunId(completed[completed.length - 1].id);
        if (chosen.length > 1) setPage("history");
        setNotice(`${completed.length} backtest${completed.length === 1 ? "" : "s"} saved to History.${controller.signal.aborted ? " Remaining markets cancelled." : failures.length ? ` ${failures.length} failed.` : ""}`);
      }
      if (controller.signal.aborted && !completed.length) setNotice("Backtest cancelled.");
      if (failures.length) setError(failures.slice(0, 5).join(" · "));
    } catch (e) { if (controller.signal.aborted) setNotice(completed.length ? `${completed.length} completed backtest${completed.length === 1 ? "" : "s"} saved. Remaining markets cancelled.` : "Backtest cancelled."); else message(e); } finally { if (backtestAbort.current === controller) backtestAbort.current = null; setBusy(""); setRunProgress(""); }
  }
  async function validate() {
    if (!selectedStrategy) return message("Choose a saved strategy.");
    setBusy("validation"); setError("");
    try {
      const base = settings();
      const bars = await loadOnlineBars(market, granularity, base.start, base.end, undefined, (loaded, estimated) => setNotice(`Loading validation: ${loaded.toLocaleString()} of about ${estimated.toLocaleString()} candles…`));
      if (bars.length < 50) throw new Error("Validation needs at least 50 bars in the selected range.");
      const split = Math.floor(bars.length * splitPct / 100); if (split < 20 || bars.length - split < 20) throw new Error("Each validation period needs at least 20 bars.");
      const strategy = parseStrategy(selectedStrategy.source);
      const train = await execute({ ...onlineDataset(), bars: bars.slice(0, split) }, strategy, { ...base, end: bars[split - 1].time }, selectedStrategy.id, "Development");
      const holdout = await execute({ ...onlineDataset(), bars: bars.slice(split) }, strategy, { ...base, start: bars[split].time }, selectedStrategy.id, "Holdout");
      setValidation({ train, holdout }); setNotice("Development and later holdout periods tested online.");
    } catch (e) { message(e); } finally { setBusy(""); }
  }
  async function removeDataset() { if (!selectedDataset) return; try { await localStore.deleteDataset(selectedDataset.id); await refresh(); setNotice("Dataset removed."); setError(""); } catch (e) { message(e); } }
  async function removeStrategy() { if (!selectedStrategy) return; try { await localStore.deleteStrategy(selectedStrategy.id); await refresh(); setNotice("Strategy removed."); setError(""); } catch (e) { message(e); } }
  async function removeRun() { if (!selectedRun) return; try { await localStore.deleteRun(selectedRun.id); await refresh(); setNotice("Run removed."); setError(""); } catch (e) { message(e); } }
  async function clearHistory() { if (!runs.length) return; try { await localStore.clearRuns(); setPortfolioIds([]); await refresh(); setNotice("All saved backtests deleted."); setError(""); } catch (e) { message(e); } }
  function togglePortfolioRun(id: string, checked: boolean) {
    if (portfolioAll) {
      setPortfolioAll(false);
      setPortfolioIds(runs.filter((run) => run.id !== id).map((run) => run.id));
    } else {
      setPortfolioIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
    }
  }
  function filterPortfolioByName(value: string) {
    setPortfolioNameFilter(value);
    setPortfolioDisplayRunId(value.trim() ? runs.find((run) => run.name.toLowerCase().includes(value.trim().toLowerCase()))?.id || "" : "");
  }
  async function exportBackup() { const [ds, ss, rs] = await Promise.all([localStore.datasets(), localStore.strategies(), localStore.runs()]); download("testify-backup.json", JSON.stringify({ format: "testify-backup-v1", datasets: ds, strategies: ss, runs: rs })); }
  async function importBackup(file: File) { try { const data = JSON.parse(await file.text()) as { format: string; datasets: Dataset[]; strategies: SavedStrategy[]; runs: Run[] }; if (data.format !== "testify-backup-v1" || !Array.isArray(data.datasets) || !Array.isArray(data.strategies) || !Array.isArray(data.runs)) throw new Error("Invalid Testify backup."); for (const d of data.datasets) { if (!d.id || !Array.isArray(d.bars)) throw new Error("Invalid dataset in backup."); await localStore.putDataset(d); } for (const s of data.strategies) { parseStrategy(s.source); await localStore.putStrategy(s); } for (const r of data.runs) { if (!r.id || !Array.isArray(r.curve)) throw new Error("Invalid run in backup."); await localStore.putRun(r); } await refresh(); setNotice("Backup restored in this browser."); } catch (e) { message(e); } }

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Activity size={23}/></div><div><strong>Testify</strong><span>STRATEGY RESEARCH</span></div></div><div className="workspace-tag"><span className="workspace-dot"/> PRIVATE BROWSER WORKSPACE</div><nav><div className="nav-section">WORKSPACE</div>{menu.map(({ id, label, icon: Icon }, i) => <div key={id}>{i === 1 && <div className="nav-section">RESEARCH</div>}<button className={`nav-item ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setError(""); }}><Icon size={16}/><span>{label}</span>{page === id && <ChevronRight size={14}/>}</button></div>)}</nav><div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={17}/><div><strong>Stored on your device</strong><span>No account or server database</span></div></div><small>Testify Web · Research only</small></div></aside>
    <main className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{menu.find((m) => m.id === page)?.label}</strong></div><div className="topbar-right"><span className="connection-pill"><span/> Online engine ready</span><span>{new Date().toLocaleDateString()}</span></div></header><div className="content">
      {error && <div className="banner error"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}{notice && <div className="banner success"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
      {page === "overview" && <><div className="page-header"><div><div className="eyebrow">YOUR RESEARCH DESK</div><h1>Build. Test. Learn.</h1><p>Load online crypto prices, create strategies with Gemini, and test them in your browser.</p></div></div><div className="hero"><div><div className="hero-kicker"><span/> A PRIVATE WORKSPACE FOR EVERY USER</div><h2>Online crypto data, ready to research.</h2><p>Testify loads public crypto candles online, then stores your chosen history, strategies and results in this browser. Export a backup before clearing browser data or switching devices.</p><div className="hero-actions"><button className="button primary" onClick={() => setPage("data")}><FileUp size={15}/> Explore crypto markets</button><button className="button subtle" onClick={() => setPage("studio")}><BrainCircuit size={15}/> Create a strategy</button></div></div><div className="hero-art"><Activity size={100}/></div></div><div className="metrics four"><Metric label="DATASETS" value={String(datasets.length)} hint={`${storageSize.toLocaleString()} bars stored`}/><Metric label="STRATEGIES" value={String(strategies.length)} hint="Editable rules"/><Metric label="BACKTESTS" value={String(runs.length)} hint="Saved locally"/><Metric label="LATEST NET RETURN" value={runs.length ? pct(runs[0].metrics.netReturnPct) : "—"} hint={runs[0]?.name || "No run yet"}/></div><div className="two-col"><section className="panel"><div className="panel-head"><div><div className="overline">GET STARTED</div><h3>Research workflow</h3></div></div><div className="steps">{[["01", "Load crypto history", "Spot candles from Coinbase Exchange", "data"], ["02", "Create a strategy", "Write rules or ask Gemini for a draft", "studio"], ["03", "Run a backtest", "Review trades, drawdown and costs", "backtests"], ["04", "Check a holdout", "Compare development and unseen periods", "validation"]].map(([n, title, subtitle, target]) => <button key={n} onClick={() => setPage(target as Page)}><b>{n}</b><div><strong>{title}</strong><small>{subtitle}</small></div><ChevronRight size={16}/></button>)}</div></section><section className="panel"><div className="panel-head"><div><div className="overline">LOCAL FILES</div><h3>Backup and restore</h3></div></div><div className="panel-body"><p>Browser storage can be removed when site data is cleared. Keep your own backup file.</p><div className="button-row"><button className="button subtle" onClick={() => void exportBackup()}><Download size={15}/> Export backup</button><label className="button subtle file-button"><FileUp size={15}/> Restore backup<input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ""; }}/></label></div></div></section></div></>}
             {page === "data" && <><div className="page-header"><div><div className="eyebrow">MARKET DATA</div><h1>Crypto markets</h1><p>Load historical spot candles directly from Coinbase Exchange. Choose a market, interval and period.</p></div></div><div className="data-layout"><section className="panel"><div className="panel-head"><div><div className="overline">COINBASE EXCHANGE</div><h3>Load candles</h3></div></div><div className="form-stack"><label>Market<select value={market} onChange={(e) => setMarket(e.target.value)}>{(!markets.length ? ["BTC-USD"] : markets).map((m) => <option key={m} value={m}>{m}</option>)}</select></label><label>Interval<select value={granularity} onChange={(e) => setGranularity(Number(e.target.value))}>{intervals.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="date-stack"><label>Start<input type="datetime-local" value={historyStart} onChange={(e) => setHistoryStart(e.target.value)}/></label><label>End<input type="datetime-local" value={historyEnd} onChange={(e) => setHistoryEnd(e.target.value)}/></label></div><button className="button primary full" disabled={busy === "data"} onClick={() => void loadCrypto()}><Database size={15}/>{busy === "data" ? "Loading…" : "Load market data"}</button><p className="help">Large ranges load in batches. Historical candles may have gaps when no trades occurred. Times are stored in UTC.</p></div><div className="divider"/><div className="dataset-list">{datasets.map((d) => <button key={d.id} className={d.id === datasetId ? "selected" : ""} onClick={() => setDatasetId(d.id)}><strong>{d.symbol}</strong><small>{d.bars.length.toLocaleString()} bars · {d.fileName}</small></button>)}{!datasets.length && <p className="empty-copy">No market data loaded yet.</p>}</div></section><section className="panel"><div className="panel-head"><div><div className="overline">DATASET</div><h3>{selectedDataset?.symbol || "Select a dataset"}</h3></div>{selectedDataset && <button className="button ghost" onClick={() => void removeDataset()}><Trash2 size={14}/> Remove</button>}</div>{selectedDataset ? <><div className="metrics three inset"><Metric label="BARS" value={selectedDataset.bars.length.toLocaleString()}/><Metric label="FIRST BAR" value={date(selectedDataset.bars[0].time)}/><Metric label="LAST BAR" value={date(selectedDataset.bars[selectedDataset.bars.length - 1].time)}/></div><PriceChart dataset={selectedDataset}/><div className="inline-note">{selectedDataset.fileName} · Spot candles · No bid/ask spread data</div></> : <div className="chart-empty">Loaded candles will appear here.</div>}</section></div></>}
{page === "studio" && <><div className="page-header"><div><div className="eyebrow">STRATEGY STUDIO</div><h1>Strategy creation</h1><p>Build strategies with custom indicator formulas and AND/OR entry rules, or ask Gemini to draft one. The backtest engine validates every formula.</p></div><button className="button subtle" onClick={() => { setStrategyId(""); setSource(JSON.stringify({ ...exampleStrategy, name: "New strategy" }, null, 2)); }}><Plus size={15}/> New strategy</button></div><div className="studio-layout"><section className="panel strategy-panel"><div className="panel-head"><div><div className="overline">LIBRARY</div><h3>Saved strategies</h3></div></div><div className="strategy-list">{strategies.map((s) => <button key={s.id} className={s.id === strategyId ? "selected" : ""} onClick={() => setStrategyId(s.id)}><Code2 size={16}/><div><strong>{s.name}</strong><small>{new Date(s.updatedAt).toLocaleDateString()}</small></div></button>)}</div></section><div className="studio-main"><section className="panel"><div className="editor-toolbar"><div><span className="file-dot"/> {selectedStrategy?.name || "New draft"}<span className="muted">strategy.json</span></div><div className="button-row"><button className="button subtle" onClick={() => { try { parseStrategy(source); setNotice("Strategy format is valid."); setError(""); } catch (e) { message(e); } }}><ShieldCheck size={14}/> Validate</button><button className="button primary" onClick={() => void saveStrategy()}><Save size={14}/> Save</button>{selectedStrategy && <button className="button ghost" onClick={() => void removeStrategy()}><Trash2 size={14}/></button>}</div></div><div className="editor-wrap"><Editor height="420px" language="json" theme="vs-dark" value={source} onChange={(value) => setSource(value || "")} options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}/></div><div className="editor-footer">Rules are evaluated after bar close; orders fill no earlier than the next bar open.</div></section><section className="panel"><div className="panel-head"><div><div className="overline">GEMINI ASSISTANT</div><h3>Generate a strategy draft</h3><p>Gemini uses a shared site key after setup. Visitors do not need their own API keys.</p></div><BrainCircuit size={25} className="accent"/></div><div className="form-stack"><label>Describe the strategy<textarea rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="For example: create a custom MACD histogram from 12/26 EMAs, enter long when it crosses above zero and volume exceeds its 20-bar average, then exit on a bearish cross."/></label><p className="help">Model: {GEMINI_MODEL} · fallback: 3.7 / 3.6 / 2.5 Flash</p><button className="button primary" disabled={busy === "gemini"} onClick={() => void askGemini()}><BrainCircuit size={15}/>{busy === "gemini" ? "Generating…" : "Generate draft"}</button><p className="help">Your strategy description is sent to Gemini through Testify. Loaded candles and saved results stay in your browser. Review every generated rule before testing.</p></div></section></div></div></>}
      {page === "backtests" && <><div className="page-header"><div><div className="eyebrow">CRYPTO BACKTEST ENGINE</div><h1>Backtests</h1><p>Test saved strategies against online crypto spot candles with next-bar execution and explicit costs.</p></div></div><div className="research-layout"><section className="panel config-panel"><div className="panel-head"><div><div className="overline">CONFIGURE</div><h3>New run</h3></div></div><div className="form-stack"><label>Run name<input value={runName} onChange={(e) => setRunName(e.target.value)}/></label><div className="market-picker"><div className="market-picker-head"><strong>Markets <span>({selectedMarkets.length} selected)</span></strong><div className="button-row"><button type="button" className="button subtle" onClick={() => setSelectedMarkets([...markets])}>Check all</button><button type="button" className="button ghost" onClick={() => setSelectedMarkets([])}>Uncheck all</button></div></div><input className="market-search" value={marketSearch} onChange={(e) => setMarketSearch(e.target.value)} placeholder="Search symbols…" aria-label="Search markets"/><div className="market-options">{visibleMarkets.map((symbol) => <label key={symbol} className="market-check"><input type="checkbox" checked={selectedMarkets.includes(symbol)} onChange={(e) => setSelectedMarkets((current) => e.target.checked ? [...current, symbol] : current.filter((item) => item !== symbol))}/><span>{symbol}</span></label>)}{!visibleMarkets.length && <p className="empty-copy">No matching markets.</p>}</div></div><label>Timeframe<select value={granularity} onChange={(e) => changeGranularity(Number(e.target.value))}>{intervals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Strategy<select value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>{strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><div className="date-stack"><label>Start<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}/></label><label>End<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}/></label></div><label>Starting capital<input type="number" min="1" value={capital} onChange={(e) => setCapital(Number(e.target.value))}/></label><div className="form-split"><label>Fee (basis points)<input type="number" min="0" step="0.1" value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))}/></label><label>Slippage (basis points)<input type="number" min="0" step="0.1" value={slippageBps} onChange={(e) => setSlippageBps(Number(e.target.value))}/></label></div><p className="help">Spot candles do not include bid/ask spread. Set fees and slippage above to model trading costs. Tester options are saved in this browser.</p><button className="button primary full" disabled={busy === "backtest" || !markets.length || !selectedMarkets.length} onClick={() => void runTest()}><Play size={15}/>{busy === "backtest" ? `Running ${runProgress}…` : selectedMarkets.length > 1 ? `Run ${selectedMarkets.length} backtests` : "Run backtest"}</button>{busy === "backtest" && <button type="button" className="button ghost full" onClick={cancelBacktest}><Square size={15}/> Cancel backtest</button>}</div></section><div className="research-main"><section className="panel"><div className="panel-head"><div><div className="overline">LATEST RESULT</div><h3>{selectedRun?.name || "No backtest yet"}</h3></div>{selectedRun && <div className="button-row"><button className="button subtle" onClick={() => download(`${selectedRun.name.replace(/\W+/g, "-")}.json`, JSON.stringify(selectedRun, null, 2))}><Download size={14}/> Export</button><button className="button ghost" onClick={() => void removeRun()}><Trash2 size={14}/></button></div>}</div>{selectedRun ? <><div className="metrics four inset"><Metric label="NET RETURN" value={pct(selectedRun.metrics.netReturnPct)}/><Metric label="MAX DRAWDOWN" value={`${fmt(selectedRun.metrics.maxDrawdownPct)}%`}/><Metric label="SHARPE" value={selectedRun.metrics.sharpe === null ? "—" : fmt(selectedRun.metrics.sharpe)}/><Metric label="TRADES" value={String(selectedRun.metrics.tradeCount)}/></div><Chart curves={[{ name: selectedRun.strategyName, points: selectedRun.curve }]}/><div className="run-meta">{selectedRun.symbol} · {selectedRun.granularity ? timeframeName(selectedRun.granularity) + " · " : ""}Win rate {fmt(selectedRun.metrics.winRatePct)}% · Fees {fmt(selectedRun.metrics.totalFees)} · {new Date(selectedRun.createdAt).toLocaleString()}</div>{selectedRun.warnings.map((w, i) => <div className="inline-note" key={i}>{w}</div>)}<div className="panel-head"><h3>Trades</h3></div><div className="trade-table"><div className="trade-row head"><span>Entry</span><span>Exit</span><span>Side</span><span>P/L</span><span>Reason</span></div>{selectedRun.trades.slice(0, 200).map((t, i) => <div className="trade-row" key={i}><span>{date(t.entryTime)}</span><span>{date(t.exitTime)}</span><span>{t.side === 1 ? "Long" : "Short"}</span><span className={t.pnl >= 0 ? "good" : "bad"}>{fmt(t.pnl)}</span><span>{t.reason}</span></div>)}{selectedRun.trades.length > 200 && <p className="help">Showing the first 200 trades. Export the run for all trades.</p>}</div></> : <div className="chart-empty">Choose markets, save a strategy, then run a test.</div>}</section></div></div></>}
      {page === "history" && <><div className="page-header"><div><div className="eyebrow">SAVED RESEARCH</div><h1>History</h1><p>Every completed market backtest is saved here in this browser. Select a run to review or export it.</p></div></div><div className="history-layout"><section className="panel"><div className="panel-head"><div><div className="overline">HISTORY</div><h3>Saved runs</h3></div><button className="button ghost" disabled={!runs.length} onClick={() => void clearHistory()}><Trash2 size={14}/> Delete all</button></div><div className="run-list">{runs.map((r) => <button key={r.id} className={runId === r.id ? "selected" : ""} onClick={() => setRunId(r.id)}><div><strong>{r.name}</strong><small>{r.symbol} · {r.granularity ? timeframeName(r.granularity) + " · " : ""}{r.strategyName} · {new Date(r.createdAt).toLocaleString()}</small></div><b className={r.metrics.netReturnPct >= 0 ? "good" : "bad"}>{pct(r.metrics.netReturnPct)}</b></button>)}{!runs.length && <p className="empty-copy">No saved runs yet.</p>}</div></section><div className="research-main"><section className="panel"><div className="panel-head"><div><div className="overline">SELECTED RUN</div><h3>{selectedRun?.name || "No backtest yet"}</h3></div>{selectedRun && <div className="button-row"><button className="button subtle" onClick={() => download(`${selectedRun.name.replace(/\W+/g, "-")}.json`, JSON.stringify(selectedRun, null, 2))}><Download size={14}/> Export</button><button className="button ghost" onClick={() => void removeRun()}><Trash2 size={14}/></button></div>}</div>{selectedRun ? <><div className="metrics four inset"><Metric label="NET RETURN" value={pct(selectedRun.metrics.netReturnPct)}/><Metric label="MAX DRAWDOWN" value={`${fmt(selectedRun.metrics.maxDrawdownPct)}%`}/><Metric label="SHARPE" value={selectedRun.metrics.sharpe === null ? "—" : fmt(selectedRun.metrics.sharpe)}/><Metric label="TRADES" value={String(selectedRun.metrics.tradeCount)}/></div><Chart curves={[{ name: selectedRun.strategyName, points: selectedRun.curve }]}/><div className="run-meta">{selectedRun.symbol} · {selectedRun.granularity ? timeframeName(selectedRun.granularity) + " · " : ""}Win rate {fmt(selectedRun.metrics.winRatePct)}% · Fees {fmt(selectedRun.metrics.totalFees)} · {new Date(selectedRun.createdAt).toLocaleString()}</div>{selectedRun.warnings.map((w, i) => <div className="inline-note" key={i}>{w}</div>)}<div className="panel-head"><h3>Trades</h3></div><div className="trade-table"><div className="trade-row head"><span>Entry</span><span>Exit</span><span>Side</span><span>P/L</span><span>Reason</span></div>{selectedRun.trades.slice(0, 200).map((t, i) => <div className="trade-row" key={i}><span>{date(t.entryTime)}</span><span>{date(t.exitTime)}</span><span>{t.side === 1 ? "Long" : "Short"}</span><span className={t.pnl >= 0 ? "good" : "bad"}>{fmt(t.pnl)}</span><span>{t.reason}</span></div>)}{selectedRun.trades.length > 200 && <p className="help">Showing the first 200 trades. Export the run for all trades.</p>}</div></> : <div className="chart-empty">Choose markets, save a strategy, then run a test.</div>}</section></div></div></>}
      {page === "validation" && <><div className="page-header"><div><div className="eyebrow">OUT OF SAMPLE CHECK</div><h1>Validation</h1><p>Split the selected period in time order. Test the strategy on development data and then on the later holdout.</p></div></div><div className="research-layout"><section className="panel config-panel"><div className="panel-head"><div><div className="overline">CONFIGURE</div><h3>Time split</h3></div></div><div className="form-stack"><label>Market<select value={market} onChange={(e) => setMarket(e.target.value)}>{(!markets.length ? ["BTC-USD"] : markets).map((m) => <option key={m} value={m}>{m}</option>)}</select></label><label>Timeframe<select value={granularity} onChange={(e) => changeGranularity(Number(e.target.value))}>{intervals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Strategy<select value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>{strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Development share: {splitPct}%<input type="range" min="30" max="80" step="5" value={splitPct} onChange={(e) => setSplitPct(Number(e.target.value))}/></label><button className="button primary full" disabled={busy === "validation" || !markets.length} onClick={() => void validate()}><FlaskConical size={15}/>{busy === "validation" ? "Testing…" : "Run holdout check"}</button><p className="help">Uses the market, timeframe, date range and cost assumptions from Backtests. The holdout is later data; it must not be used to tune the strategy.</p></div></section><div className="research-main"><section className="panel"><div className="panel-head"><div><div className="overline">COMPARISON</div><h3>Development vs holdout</h3></div></div>{validation ? <><div className="metrics four inset"><Metric label="DEVELOPMENT RETURN" value={pct(validation.train.metrics.netReturnPct)}/><Metric label="HOLDOUT RETURN" value={pct(validation.holdout.metrics.netReturnPct)}/><Metric label="HOLDOUT DRAWDOWN" value={`${fmt(validation.holdout.metrics.maxDrawdownPct)}%`}/><Metric label="HOLDOUT TRADES" value={String(validation.holdout.metrics.tradeCount)}/></div><Chart curves={[{ name: "Development", points: validation.train.curve }, { name: "Holdout", points: validation.holdout.curve }]}/><div className="inline-note">Both periods start with the configured capital. The holdout curve is shown separately rather than joined to development.</div></> : <div className="chart-empty">Run a holdout check to compare periods.</div>}</section></div></div></>}
      {page === "portfolio" && <><div className="page-header"><div><div className="eyebrow">PORTFOLIO LAB</div><h1>Portfolio equity</h1><p>Select runs for a portfolio view, or filter by your custom Run name to display one saved backtest.</p></div></div><div className="two-col portfolio-layout"><section className="panel"><div className="panel-head"><div><div className="overline">SELECT</div><h3>Saved runs</h3></div><button className="button subtle" type="button" aria-pressed={portfolioAll} onClick={() => { setPortfolioAll((current) => !current); setPortfolioIds([]); setPortfolioDisplayRunId(""); setPortfolioNameFilter(""); }}>{portfolioAll ? "All selected" : "Select all"}</button></div><div className="portfolio-list">{runs.map((r) => <label key={r.id}><input type="checkbox" checked={portfolioAll || portfolioIds.includes(r.id)} onChange={(e) => togglePortfolioRun(r.id, e.target.checked)}/><div><strong>{r.name}</strong><small>{r.symbol} · {r.granularity ? timeframeName(r.granularity) + " · " : ""}{r.strategyName}</small></div><b className={r.metrics.netReturnPct >= 0 ? "good" : "bad"}>{pct(r.metrics.netReturnPct)}</b></label>)}{!runs.length && <p className="empty-copy">Run backtests first to compare them.</p>}</div></section><section className="panel"><div className="panel-head"><div><div className="overline">VIEW</div><h3>{portfolioMode === "overlay" ? "Individual equity curves" : "Combined portfolio curve"}</h3></div></div><div className="portfolio-filter"><label>Filter by Run name<input type="search" value={portfolioNameFilter} onChange={(e) => filterPortfolioByName(e.target.value)} placeholder="Search your run names…"/></label><label>Display run<select value={activeDisplayRunId} onChange={(e) => { setPortfolioDisplayRunId(e.target.value); if (!e.target.value) setPortfolioNameFilter(""); }} disabled={!runs.length}><option value="">All selected runs</option>{matchingRunNames.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.symbol} · {new Date(r.createdAt).toLocaleString()}</option>)}</select></label>{portfolioNameFilter.trim() && !matchingRunNames.length && <p className="help">No saved Run names match.</p>}</div><div className="mode-switch" role="group" aria-label="Portfolio view"><button className={portfolioMode === "overlay" ? "active" : ""} onClick={() => setPortfolioMode("overlay")}>Individual lines</button><button className={portfolioMode === "combined" ? "active" : ""} onClick={() => setPortfolioMode("combined")}>Combined portfolio</button></div>{portfolioMode === "overlay" ? <><Chart curves={displayedPortfolio.map((r) => ({ name: `${r.symbol} · ${r.name}`, points: r.curve }))}/><div className="inline-note">Each line shows one independent backtest with its own starting capital.</div></> : <>{displayedPortfolio.length > 0 && <div className="metrics three inset"><Metric label="COMBINED RETURN" value={pct(combinedPortfolio.returnPct)}/><Metric label="MAX DRAWDOWN" value={`${fmt(combinedPortfolio.maxDrawdownPct)}%`}/><Metric label="SELECTED RUNS" value={String(displayedPortfolio.length)}/></div>}<Chart curves={combinedPortfolio.curve.length ? [{ name: "Combined portfolio", points: combinedPortfolio.curve }] : []}/><div className="inline-note">Each run contributes its percentage return against the same starting capital. A −10% run and a +15% run combine to +5%. This assumes full starting capital on every selected run, so total exposure grows with the number of runs. Curves are aligned by time; a run contributes 0% before it starts and holds its last value after it ends.</div></>}</section></div></>}
    </div><footer className="footer"><span><span className="footer-dot"/> Crypto research engine</span><span>Research results depend on data and modeling assumptions.</span></footer></main>
  </div>;
}
