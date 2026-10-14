import AnimatedValue from "./AnimatedValue";
import { equityLines, metricTone } from "./theme";
import ReturningDashboard from "./ReturningDashboard";
import PenpotWorkspace, { type RunOptions } from "./PenpotWorkspace";
import { AnimatedSelect, DateTimePicker, RangeSlider } from "./AnimatedControls";
import { BacktestResults, BacktestHistory, CompareBacktests, BacktestProgress } from "./BacktestResults";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
const PenpotStrategyStudio = lazy(() => import("./PenpotStrategyStudio"));
import ReactECharts from "echarts-for-react";
import { Download, FlaskConical, Square } from "lucide-react";
import { createLocalStore } from "./storage";
import { exampleStrategy, parseStrategy, type BacktestSettings, type Dataset, type Run, type SavedStrategy } from "./types";
import { generateStrategy, reviseStrategy, consultStrategy, type ConsultationMessage } from "./gemini";
import Connections from "./Connections";
import { browserSummary, cloudRequest, loadCloudRuns, mergeCloudRuns } from "./cloud-research";

import { combinePortfolio } from "./portfolio";
import { researchWindow, sameResearchWindow, summarizeDevelopmentRun, summarizeDevelopmentPortfolio } from "./research";
import { createStrategyStore, StrategyStoreError } from "./strategy-store";
import RunPicker from "./RunPicker";
import EmptyDashboard from "./EmptyDashboard";
import WorkspaceShell, { type WorkspacePage } from "./WorkspaceShell";
import { DataPage, BacktestsPage } from "./WorkspacePages";
import StrategiesPage from "./StrategiesPage";
import ConfirmStrategyDelete from "./ConfirmStrategyDelete";
import { duplicateStrategyName, parseStrategyImport } from "./strategyLibrary";
import { datasetCoverage, parseMarketCsv } from "./marketData";

type Page = WorkspacePage;
const fmt = (n: number, digits = 2) => Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
import { validateData } from "./data-validation";
import { createApiClient, type ApiFetch } from "./api-client";
import type { ReactNode } from "react";

const pct = (n: number) => `${n >= 0 ? "+" : ""}${fmt(n)}%`;
const date = (seconds: number) => new Date(seconds * 1000).toLocaleString();
const dateInput = (seconds: number) => { const d = new Date(seconds * 1000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const timeframeName = (seconds: number) => ({ 60: "1m", 300: "5m", 900: "15m", 1800: "30m", 3600: "1h", 14400: "4h", 21600: "6h", 86400: "1d" } as Record<number, string>)[seconds] || `${seconds}s`;
const intervals: [number, string][] = [[60, "1 minute"], [300, "5 minutes"], [900, "15 minutes"], [1800, "30 minutes"], [3600, "1 hour"], [14400, "4 hours"], [21600, "6 hours"], [86400, "1 day"]];
const TESTER_OPTIONS_KEY = "testify-tester-options-v1";
type TesterOptions = { strategyId: string; market: string; selectedMarkets: string[]; granularity: number; runName: string; capital: number; feeBps: number; feeMode: "fixed" | "percentage"; feePerTrade: number; slippageBps: number; autoSlippage: boolean; start: string; end: string; splitPct: number; testDatasetId: string; multiMarket: boolean };
function readTesterOptions(userId: string): Partial<TesterOptions> {

  try {
    const raw = localStorage.getItem(`${TESTER_OPTIONS_KEY}:${userId}`);
    if (!raw) return {};
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const options: Partial<TesterOptions> = {};
    if (saved.feeMode === "fixed" || saved.feeMode === "percentage") options.feeMode = saved.feeMode;
    if (typeof saved.feePerTrade === "number" && Number.isFinite(saved.feePerTrade) && saved.feePerTrade >= 0) options.feePerTrade = saved.feePerTrade;
    if (typeof saved.autoSlippage === "boolean") options.autoSlippage = saved.autoSlippage;
    if (typeof saved.strategyId === "string") options.strategyId = saved.strategyId;
    if (typeof saved.testDatasetId === "string") options.testDatasetId = saved.testDatasetId;
    if (typeof saved.multiMarket === "boolean") options.multiMarket = saved.multiMarket;
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
function Chart({ curves }: { curves: { name: string; points: { time: number; equity: number }[]; capital?: number }[] }) {
  if (!curves.length || !curves.some((c) => c.points.length)) return <div className="chart-empty">Run a backtest to see an equity curve.</div>;
  return <ReactECharts style={{ height: 320 }} option={{ backgroundColor: "transparent", animation: true, animationDuration: 500, animationEasing: "cubicOut", tooltip: { trigger: "axis", backgroundColor: "#30497d", borderColor: "#385863", textStyle: { color: "#e5f4f2" }, valueFormatter: (value: number) => `$${fmt(value)}` }, legend: { top: 0, textStyle: { color: "#9ab2bd" } }, grid: { left: 70, right: 24, top: 48, bottom: 45 }, xAxis: { type: "time", axisLabel: { color: "#ffffff" } }, yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: "#455b8a" } }, axisLabel: { color: "#ffffff" } }, series: curves.flatMap((c, i) => equityLines(c.name, c.points, false, Boolean(i % 2), c.capital)) }} />;

}
function PriceChart({ dataset }: { dataset: Dataset }) {
  const stride = Math.max(1, Math.ceil(dataset.bars.length / 1200));
  return <ReactECharts style={{ height: 270 }} option={{ backgroundColor: "transparent", animation: true, animationDuration: 500, animationEasing: "cubicOut", tooltip: { trigger: "axis" }, grid: { left: 65, right: 20, top: 20, bottom: 42 }, xAxis: { type: "time", axisLabel: { color: "#ffffff" } }, yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: "#455b8a" } }, axisLabel: { color: "#ffffff" } }, series: [{ type: "line", showSymbol: false, lineStyle: { color: "#f2842f", width: 2 }, data: dataset.bars.filter((_, i) => i % stride === 0).map((b) => [b.time * 1000, b.close]) }] }} />;
}
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) { return <div className="metric"><span>{label}</span><strong className={value.startsWith("+") && parseFloat(value.slice(1).replace(",", "."))>0 ? "positive" : (label.includes("DRAWDOWN") && parseFloat(value.replace(",", "."))>0) || value.startsWith("-") ? "negative" : ""}><AnimatedValue animate={label.includes("RETURN")} tone={label.includes("DRAWDOWN")?metricTone("Max drawdown",Number(value.replace(/[^0-9.-]/g,""))):label.includes("RETURN")?metricTone("Return",Number(value.replace(/[^0-9.-]/g,""))):undefined} value={value}/></strong>{hint && <small>{hint}</small>}</div>; }
function download(name: string, content: string, type = "application/json") { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const cancelled = () => new DOMException("Backtest cancelled.", "AbortError");
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(cancelled());
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(cancelled()); };
  signal?.addEventListener("abort", onAbort, { once: true });
});
async function fetchWithRateLimitRetry(apiFetch: ApiFetch, input: RequestInfo | URL, init?: RequestInit, onWait?: (seconds: number, attempt: number) => void): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await apiFetch(input, init);
    if (response.status !== 429 || attempt >= 6) return response;
    const header = Number(response.headers.get("Retry-After"));
    const seconds = Number.isFinite(header) && header > 0 ? Math.max(60, Math.min(300, header)) : 60;
    onWait?.(seconds, attempt);
    await pause(seconds * 1000, init?.signal || undefined);
  }
}
const CANDLES_PER_REQUEST = 2392;
async function loadOnlineBars(apiFetch: ApiFetch, symbol: string, granularity: number, start: number, end: number, signal?: AbortSignal, onProgress?: (loaded: number, estimated: number) => void): Promise<Dataset["bars"]> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("Choose a valid historical date range.");
  const byTime = new Map<number, Dataset["bars"][number]>();
  const estimated = Math.ceil((end - start) / granularity);
  for (let cursor = start; cursor < end; cursor += CANDLES_PER_REQUEST * granularity) {
    if (signal?.aborted) throw cancelled();
    const to = Math.min(end, cursor + CANDLES_PER_REQUEST * granularity);
    const query = new URLSearchParams({ product: symbol, granularity: String(granularity), start: String(cursor), end: String(to) });
    const response = await fetchWithRateLimitRetry(apiFetch, `/api/candles?${query}`, { signal }, () => onProgress?.(byTime.size, estimated));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load candles.");
    for (const bar of data.bars as Dataset["bars"]) byTime.set(bar.time, bar);
    onProgress?.(byTime.size, estimated);
    if (to < end) await pause(500, signal);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
function execute(dataset: Dataset, strategy: ReturnType<typeof parseStrategy>, settings: BacktestSettings, strategyId: string, name: string, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<Run> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { signal?.removeEventListener("abort", onAbort); worker.terminate(); };
    const onAbort = () => { cleanup(); reject(cancelled()); };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; run?: Run; error?: string; progress?: number }>) => { if (event.data.progress !== undefined) { onProgress?.(event.data.progress); return; } cleanup(); event.data.ok && event.data.run ? resolve(event.data.run) : reject(new Error(event.data.error || "Backtest failed.")); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Backtest worker failed.")); };
    worker.postMessage({ dataset, strategy, settings, strategyId, name });
  });
}

export default function App({ userId, sessionId, onSessionExpired, accountControls, initialPage = "overview" }: { initialPage?: Page; userId: string; sessionId: string; onSessionExpired: () => void; accountControls: ReactNode }) {
  const localStore = useMemo(() => createLocalStore(userId), [userId]);
  const [sessionController] = useState(() => new AbortController());
  const apiFetch = useMemo(() => createApiClient(sessionId, sessionController.signal, onSessionExpired), [sessionId, sessionController]);
  const strategyStore = createStrategyStore(apiFetch);
  const [savedTesterOptions] = useState(() => readTesterOptions(userId));
  const [page, setPageState] = useState<Page>(() => new URLSearchParams(location.search).has("mcpAuthorize") ? "connections" : initialPage);
  function setPage(target: Page) { history.replaceState(null, "", `#/app/${target}`); setPageState(target); }
  useEffect(() => { const sync = () => { const route = location.hash.replace("#/app/", "") as Page; if (["overview", "strategies", "studio", "data", "backtests", "history", "results", "compare", "validation", "portfolio", "runsettings", "trades", "connections"].includes(route)) setPageState(route); }; addEventListener("hashchange", sync); addEventListener("popstate", sync); return () => { removeEventListener("hashchange", sync); removeEventListener("popstate", sync); }; }, []);
  const [cloudAvailable, setCloudAvailable] = useState(false);

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [testDatasetId, setTestDatasetId] = useState(savedTesterOptions.testDatasetId || "online");
  const [multiMarket, setMultiMarket] = useState(savedTesterOptions.multiMarket ?? (savedTesterOptions.selectedMarkets?.length || 0) > 1);
  const [strategyId, setStrategyId] = useState(savedTesterOptions.strategyId || "");
  const [runId, setRunId] = useState(() => { try { return localStorage.getItem(`testify-selected-run:${userId}`) || ""; } catch { return ""; } });
  const [compareIds, setCompareIds] = useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(`testify-compare-runs:${userId}`)||"[]");return Array.isArray(saved)?saved.filter((id):id is string=>typeof id==="string"):[];}catch{return [];}});
  const [activeRunContext, setActiveRunContext] = useState({name:"",description:""});
  const [source, setSource] = useState(JSON.stringify(exampleStrategy, null, 2));
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryLoadError, setLibraryLoadError] = useState("");
  const [strategyToDelete, setStrategyToDelete] = useState<SavedStrategy | null>(null);
  const [editingRevision, setEditingRevision] = useState(0);
  const [renamingRunId, setRenamingRunId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [markets, setMarkets] = useState<string[]>([]);
  const [market, setMarket] = useState(savedTesterOptions.market || "BTC-USD");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(savedTesterOptions.selectedMarkets ?? ["BTC-USD"]);
  const [marketSearch, setMarketSearch] = useState("");
  const [granularity, setGranularity] = useState(savedTesterOptions.granularity || 3600);
  const [historyStart, setHistoryStart] = useState(dateInput(Math.floor(Date.now() / 1000) - 14 * 86400));
  const [historyEnd, setHistoryEnd] = useState(dateInput(Math.floor(Date.now() / 1000)));
  const [idea, setIdea] = useState("");
  const [studioMode, setStudioMode] = useState<"create" | "improve">("create");
  const [runName, setRunName] = useState(savedTesterOptions.runName ?? "New research run");
  const [capital, setCapital] = useState(savedTesterOptions.capital ?? 10000);
  const [feeBps, setFeeBps] = useState(savedTesterOptions.feeBps ?? 2);
  const [autoSlippage, setAutoSlippage] = useState(savedTesterOptions.autoSlippage ?? false);
  const [feeMode, setFeeMode] = useState<"fixed" | "percentage">(savedTesterOptions.feeMode ?? "percentage");
  const [feePerTrade, setFeePerTrade] = useState(savedTesterOptions.feePerTrade ?? 1);
  const [slippageBps, setSlippageBps] = useState(savedTesterOptions.slippageBps ?? 1);
  const [start, setStart] = useState(savedTesterOptions.start || dateInput(Math.floor(Date.now() / 1000) - 14 * 86400));
  const [end, setEnd] = useState(savedTesterOptions.end || dateInput(Math.floor(Date.now() / 1000)));
  const [splitPct, setSplitPct] = useState(savedTesterOptions.splitPct ?? 70);
  const [validationResults, setValidationResults] = useState<{ source: Run; run: Run }[]>([]);
  const [validationIds, setValidationIds] = useState<string[]>([]);
  const [validationProgress, setValidationProgress] = useState("");
  const validationAbort = useRef<AbortController | null>(null);
  const [consultation, setConsultation] = useState<ConsultationMessage[]>([]);
  const [feedbackMode, setFeedbackMode] = useState<"runs" | "portfolio">("runs");
  const [feedbackIds, setFeedbackIds] = useState<string[]>([]);
  const [portfolioIds, setPortfolioIds] = useState<string[]>([]);
  const [portfolioAll, setPortfolioAll] = useState(() => { try { return localStorage.getItem(`testify-portfolio-all:${userId}`) === "true"; } catch { return false; } });
  const [portfolioDisplayRunId, setPortfolioDisplayRunId] = useState("");
  const [portfolioNameFilter, setPortfolioNameFilter] = useState("");
  const [portfolioMode, setPortfolioMode] = useState<"overlay" | "combined">("overlay");
  const [runProgress, setRunProgress] = useState("");
  const [runPercent, setRunPercent] = useState(0);
  const backtestAbort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedDataset = datasets.find((d) => d.id === datasetId);
  const selectedStrategy = strategies.find((s) => s.id === strategyId);
  const selectedRun = runs.find((r) => r.id === runId);
  const selectedPortfolio = useMemo(() => runs.filter((r) => portfolioAll || portfolioIds.includes(r.id)), [runs, portfolioIds, portfolioAll]);
  const matchingRunNames = useMemo(() => runs.filter(run => run.name.toLowerCase().includes(portfolioNameFilter.trim().toLowerCase())), [runs, portfolioNameFilter]);
  const activeDisplayRunId = matchingRunNames.some(run => run.id === portfolioDisplayRunId) ? portfolioDisplayRunId : "";
  const displayedPortfolio = useMemo(() => activeDisplayRunId ? runs.filter(run => run.id === activeDisplayRunId) : selectedPortfolio.filter(run => run.name.toLowerCase().includes(portfolioNameFilter.trim().toLowerCase())), [runs, selectedPortfolio, portfolioNameFilter, activeDisplayRunId]);
  const combinedPortfolio = useMemo(() => combinePortfolio(displayedPortfolio), [displayedPortfolio]);
  const validationEligible = useMemo(() => runs.filter((run) => run.research?.phase === "development" && !!run.strategySource && !!run.granularity), [runs]);
  const selectedValidationRuns = useMemo(() => validationEligible.filter((run) => validationIds.includes(run.id)), [validationEligible, validationIds]);
  const validatedPortfolio = useMemo(() => combinePortfolio(validationResults.map((item) => item.run)), [validationResults]);
  const feedbackEligible = useMemo(() => {
    if (!selectedStrategy) return [];
    try { const current = JSON.stringify(parseStrategy(source)); return validationEligible.filter((run) => run.strategyId === selectedStrategy.id && run.strategySource === current); }
    catch { return []; }
  }, [validationEligible, selectedStrategy?.id, source]);
  const selectedFeedbackRuns = useMemo(() => feedbackEligible.filter((run) => feedbackIds.includes(run.id)), [feedbackEligible, feedbackIds]);
  const geminiPortfolio = useMemo(() => selectedFeedbackRuns.length ? summarizeDevelopmentPortfolio(selectedFeedbackRuns) : undefined, [selectedFeedbackRuns]);
  const visibleMarkets = useMemo(() => markets.filter((symbol) => symbol.toLowerCase().includes(marketSearch.trim().toLowerCase())), [markets, marketSearch]);

  useEffect(() => () => { sessionController.abort(); backtestAbort.current?.abort(); validationAbort.current?.abort(); }, [sessionController]);
  async function refresh() {
    const [ds, ss, rs] = await Promise.all([localStore.datasets(), strategyStore.strategies(), localStore.runs()]);
    ds.sort((a, b) => b.importedAt - a.importedAt); ss.sort((a, b) => b.updatedAt - a.updatedAt); rs.sort((a, b) => b.createdAt - a.createdAt);
    let combined = rs;
    try {
      const cloud = await loadCloudRuns(apiFetch);
      combined = mergeCloudRuns(rs, cloud); setCloudAvailable(true);
      for (const local of rs) { const remote = cloud.find(r => r.id === local.id); if (remote && remote.name !== local.name) await localStore.putRun({ ...local, name: remote.name }); }
    } catch { setCloudAvailable(false); }
    setDatasets(ds); setStrategies(ss); setRuns(combined); setStorageLoaded(true);

    setDatasetId((current) => ds.some((d) => d.id === current) ? current : ds[0]?.id || "");
    setStrategyId((current) => ss.some((s) => s.id === current) ? current : ss[0]?.id || "");
    setRunId((current) => combined.some((r) => r.id === current) ? current : combined[0]?.id || "");
  }
  async function initializeWorkspace() {
    setLibraryLoading(true); setLibraryLoadError("");
    try {
      const cloud = await strategyStore.strategies();
      const migratedKey = `testify-strategies-migrated:${userId}`;
      if (localStorage.getItem(migratedKey) !== "true") {
        const local = await localStore.strategies();
        const available = [...cloud];
        const idMap = new Map<string, string>();
        for (const strategy of local) {
          const normalized = JSON.stringify(parseStrategy(strategy.source));
          const match = available.find((item) => JSON.stringify(parseStrategy(item.source)) === normalized);
          if (match) { idMap.set(strategy.id, match.id); continue; }
          const id = available.some((item) => item.id === strategy.id) ? crypto.randomUUID() : strategy.id;
          try {
            available.push(await strategyStore.putStrategy({ ...strategy, id, revision: 0 }));
            idMap.set(strategy.id, id);
          } catch (error) {
            if (!(error instanceof StrategyStoreError) || error.status !== 409) throw error;
            const refreshed = await strategyStore.strategies();
            const same = refreshed.find((item) => JSON.stringify(parseStrategy(item.source)) === normalized);
            const imported = same ?? await strategyStore.putStrategy({ ...strategy, id: crypto.randomUUID(), revision: 0 });
            available.push(imported); idMap.set(strategy.id, imported.id);
          }
        }
        for (const run of await localStore.runs()) { const mapped = idMap.get(run.strategyId); if (mapped && mapped !== run.strategyId) await localStore.putRun({ ...run, strategyId: mapped }); }
        localStorage.setItem(migratedKey, "true");
      }
      await refresh();
    } catch (e) { setLibraryLoadError(e instanceof Error ? e.message : "Could not load your workspace."); } finally { setStorageLoaded(true); setLibraryLoading(false); }

  }
  const loadWorkspace = initializeWorkspace;
  useEffect(() => { void initializeWorkspace(); }, []);

  useEffect(() => {
    const options: TesterOptions = { strategyId, market, selectedMarkets, granularity, runName, capital, feeBps, feeMode, feePerTrade, slippageBps, autoSlippage, start, end, splitPct, testDatasetId, multiMarket };
    try { localStorage.setItem(`${TESTER_OPTIONS_KEY}:${userId}`, JSON.stringify(options)); } catch { /* The form still works when browser storage is unavailable. */ }
  }, [strategyId, market, selectedMarkets, granularity, runName, capital, feeBps, feeMode, feePerTrade, slippageBps, autoSlippage, start, end, splitPct, testDatasetId, multiMarket]);
  useEffect(() => { try { localStorage.setItem(`testify-portfolio-all:${userId}`, String(portfolioAll)); } catch { /* Selection still works for this visit. */ } }, [portfolioAll]);
  useEffect(() => { void (async () => { try { const response = await fetchWithRateLimitRetry(apiFetch, "/api/markets", { signal: sessionController.signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load markets."); setMarkets(data.markets.map((m: { id: string }) => m.id)); } catch (e) { message(e); } })(); }, []);
  useEffect(() => { if (selectedStrategy) { setSource(selectedStrategy.source); setEditingRevision(selectedStrategy.revision ?? 0); } }, [selectedStrategy?.id]);
  useEffect(() => {
    if (!["history", "portfolio", "connections"].includes(page)) return;
    const timer = setInterval(() => { if (!document.hidden && !busy) void refresh().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [page, busy, apiFetch]);
  async function uploadHistorySummaries() {
    setBusy("upload-summaries"); setError("");
    try {
      const local = (await localStore.runs()).filter(r => r.research?.phase !== ("holdout" as string));
      for (const run of local) await cloudRequest(apiFetch, { action: "upload", runs: [browserSummary(run)] });
      await refresh(); setNotice(`${local.length} history summaries uploaded. Full trades and candles remain in this browser.`);
    } catch (e) { message(e); } finally { setBusy(""); }
  }

  function message(e: unknown) { setError(e instanceof Error ? e.message : String(e)); setNotice(""); }
  async function loadCrypto() {
    setBusy("data"); setError("");
    try {
      const bars = await loadOnlineBars(apiFetch, market, granularity, Date.parse(historyStart) / 1000, Date.parse(historyEnd) / 1000, sessionController.signal, (loaded, estimated) => setNotice(`Loading ${market}: ${loaded.toLocaleString()} of about ${estimated.toLocaleString()} candles…`));
      if (!bars.length) { const report = validateData(bars, Date.parse(historyStart) / 1000, Date.parse(historyEnd) / 1000, granularity); throw new Error(`No candles returned. ${report.expected.toLocaleString()} expected, ${report.missing.toLocaleString()} missing (100%). Try another period or market.`); }
      const dataset: Dataset = { id: crypto.randomUUID(), symbol: market, fileName: `Coinbase · ${granularity / 60}m`, importedAt: Date.now(), bars, skipped: 0, validation: validateData(bars, Date.parse(historyStart) / 1000, Date.parse(historyEnd) / 1000, granularity) };
      await localStore.putDataset(dataset); await refresh(); setDatasetId(dataset.id);
      setNotice(`Loaded ${dataset.bars.length.toLocaleString()} ${market} candles from Coinbase. ${dataset.validation!.missing.toLocaleString()} missing (${(100 - dataset.validation!.coveragePct).toFixed(2)}%).`);
    } catch (e) { message(e); } finally { setBusy(""); }
  }
  async function validateDraft() {
    if (busy) return;
    setBusy("strategy-validate"); setError("");
    try {
      const strategy = parseStrategy(source);
      if (strategy.version === 3) await new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event) => { worker.terminate(); event.data.ok ? resolve() : reject(new Error(event.data.error)); };
        worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message)); };
        worker.postMessage({ action: "validate", strategy });
      });
      setNotice(strategy.version === 3 ? "Custom strategy passed syntax and synthetic execution checks. Run a historical backtest to evaluate it." : "Strategy format is valid.");
    } catch (error) { message(error); } finally { setBusy(""); }
  }
  async function saveStrategy() {
    if (busy) return; setBusy("strategy-save");
    setError("");
    try { const parsed = parseStrategy(source); const id = strategyId || crypto.randomUUID(); const saved = await strategyStore.putStrategy({ id, name: parsed.name, source: JSON.stringify(parsed, null, 2), updatedAt: Date.now(), revision: selectedStrategy ? editingRevision : 0 }); setEditingRevision(saved.revision ?? 0); await refresh(); setStrategyId(id); setSource(JSON.stringify(parsed, null, 2)); setNotice(`Saved ${parsed.name} to your account.`); } catch (e) { message(e); } finally { setBusy(""); }
  }
  async function askGemini() {
    if (busy) return;
    setBusy("gemini-create"); setError("");
    try { const { strategy, model } = await generateStrategy(idea, apiFetch); setSource(JSON.stringify(strategy, null, 2)); setStrategyId(""); setNotice(`${model} created a draft. Review and save it before testing.`); } catch (e) { message(e); } finally { setBusy(""); }
  }
  async function askGeminiQuestion() {
    if (busy || !idea.trim()) return;
    setBusy("gemini-ask"); setError("");
    const question = idea.trim();
    try {
      let current;
      try { current = JSON.parse(source); } catch { throw new Error("Your strategy JSON must be readable before Gemini can discuss it."); }
      const { answer } = await consultStrategy(apiFetch, current, feedbackMode === "runs" ? selectedFeedbackRuns.map(summarizeDevelopmentRun) : [], question, consultation, feedbackMode === "portfolio" ? geminiPortfolio : undefined);
      setConsultation(previous => [...previous, { role: "user", text: question }, { role: "assistant", text: answer }].slice(-12) as ConsultationMessage[]);
      setIdea("");
    } catch (e) { message(e); } finally { setBusy(""); }
  }
  useEffect(() => { setConsultation([]); }, [strategyId]);
  async function askGeminiRevision() {
    if (busy) return;
    if (!selectedStrategy) return message("Select a saved strategy to revise.");
    setBusy("gemini-modify"); setError("");
    try {
      const current = parseStrategy(source);
      const { strategy, model } = await reviseStrategy(apiFetch, current, feedbackMode === "runs" ? selectedFeedbackRuns.map(summarizeDevelopmentRun) : [], idea, feedbackMode === "portfolio" ? geminiPortfolio : undefined);
      setSource(JSON.stringify(strategy, null, 2));
      setFeedbackIds([]);
      setNotice(`${model} revised the selected strategy draft. Review the changes, then Save to update it. Run new development backtests before validating this version.`);
    } catch (e) { message(e); } finally { setBusy(""); }
  }
  function settings(): BacktestSettings { return { capital, feeBps: feeMode === "fixed" ? 0 : feeBps, ...(feeMode === "fixed" ? { feePerTrade } : {}), slippageBps, start: Date.parse(start) / 1000, end: Date.parse(end) / 1000 }; }
  function onlineDataset(symbol = market): Dataset { return { id: "online", symbol, fileName: `Coinbase · ${granularity / 60}m`, importedAt: Date.now(), bars: [], skipped: 0 }; }
  function changeGranularity(value: number) {
    setGranularity(value);
  }
  function cancelBacktest() { backtestAbort.current?.abort(); setRunProgress("Cancelling"); }
  async function runTest() {
    if (!selectedStrategy) return message("Choose a saved strategy.");
    if (testDatasetId === "online" && !selectedMarkets.length) return message("Check at least one market.");
    setActiveRunContext({name:runName,description:`${selectedStrategy.name} · ${testDatasetId==="online" ? selectedMarkets.join(", ") : datasets.find(dataset=>dataset.id===testDatasetId)?.symbol} · ${timeframeName(granularity)}`});
    setBusy("backtest"); setError(""); setRunPercent(0);
    const controller = new AbortController();
    backtestAbort.current = controller;
    const completed: Run[] = [];
    const failures: string[] = [];
    try {
      const strategy = parseStrategy(selectedStrategy.source);
      const fullSettings = settings();
      const window = researchWindow(fullSettings.start, fullSettings.end, splitPct);
      if ((window.boundary - window.fullStart) / granularity < 20 || (window.fullEnd - window.boundary) / granularity < 20) throw new Error("Choose a wider range so both development and holdout have at least 20 candle slots.");
      const assumptions = { ...fullSettings, end: window.boundary };
      const storedDataset = datasets.find(dataset => dataset.id === testDatasetId);
      if (testDatasetId !== "online" && !storedDataset) throw new Error("Choose an available dataset.");
      const chosen = storedDataset ? [storedDataset.symbol] : multiMarket ? [...selectedMarkets] : [selectedMarkets[0]];
      const runGranularity = storedDataset ? datasetCoverage(storedDataset).seconds : granularity;
      for (const [index, symbol] of chosen.entries()) {
        if (controller.signal.aborted) break;
        if (index) await pause(1000, controller.signal);
        setRunPercent(index / chosen.length * 100); setRunProgress(`${index + 1} of ${chosen.length}: ${symbol}`);
        try {
          const name = runName.trim() || "Research run";
          const marketSettings = { ...assumptions };
          let slippageNote = "";
          if (autoSlippage) {
            setRunProgress(`${index + 1} of ${chosen.length}: ${symbol} � estimating slippage`);
            const response = await fetchWithRateLimitRetry(apiFetch, `/api/slippage?${new URLSearchParams({ product: symbol, notional: String(capital) })}`, { signal: controller.signal });
            const estimate = await response.json();
            if (!response.ok || !Number.isFinite(estimate.slippageBps) || estimate.slippageBps < 0) throw new Error(estimate.error || "Slippage estimate unavailable. Switch to manual slippage to test this market.");
            marketSettings.slippageBps = estimate.slippageBps;
            slippageNote = `Slippage estimate: ${estimate.slippageBps} bps per side for ${symbol}, sampled ${new Date(estimate.sampledAt).toISOString()}, reference order ${fmt(capital)} quote currency. ${estimate.method} Fixed for this run; real costs vary with order size, equity and market conditions. Commission is separate.`;
          }

          const bars = storedDataset ? storedDataset.bars.filter(bar => bar.time >= assumptions.start && bar.time < assumptions.end) : await loadOnlineBars(apiFetch, symbol, granularity, assumptions.start, assumptions.end, controller.signal, (loaded, estimated) => { setRunPercent((index + Math.min(.7, loaded / Math.max(1, estimated) * .7)) / chosen.length * 100); setRunProgress(`${index + 1} of ${chosen.length}: ${symbol} · ${loaded.toLocaleString()} / ~${estimated.toLocaleString()} candles`); });
          if (bars.length < 20) throw new Error("At least 20 candles are needed for a backtest.");
          setRunPercent((index + .7) / chosen.length * 100); setRunProgress(`${index + 1} of ${chosen.length}: ${symbol} · calculating`);
          const run = await execute({ ...(storedDataset || onlineDataset(symbol)), bars }, strategy, marketSettings, selectedStrategy.id, name, controller.signal, fraction => setRunPercent((index + .7 + fraction * .25) / chosen.length * 100));
          if (controller.signal.aborted) break;
          run.granularity = runGranularity;
          run.datasetId = storedDataset?.id;
          if (slippageNote) run.warnings.push(slippageNote);

          run.strategySource = JSON.stringify(strategy);
          run.research = { ...window, phase: "development" };
          if(!storedDataset){const snapshot={...onlineDataset(symbol),id:crypto.randomUUID(),bars};await localStore.putDataset(snapshot);run.priceDatasetId=snapshot.id;}
          await localStore.putRun(run);
          setRunPercent((index + 1) / chosen.length * 100); completed.push(run);
          setRunId(run.id);
          await refresh();
        } catch (error) { if (controller.signal.aborted) break; failures.push(`${symbol}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (completed.length) {
        setRunId(completed[completed.length - 1].id);
        setPage(chosen.length > 1 ? "history" : "results");
        setNotice(`${completed.length} backtest${completed.length === 1 ? "" : "s"} saved to History.${controller.signal.aborted ? " Remaining markets cancelled." : failures.length ? ` ${failures.length} failed.` : ""}`);
      }
      if (controller.signal.aborted && !completed.length) setNotice("Backtest cancelled.");
      if (failures.length) setError(failures.slice(0, 5).join(" · "));
    } catch (e) { if (controller.signal.aborted) setNotice(completed.length ? `${completed.length} completed backtest${completed.length === 1 ? "" : "s"} saved. Remaining markets cancelled.` : "Backtest cancelled."); else message(e); } finally { if (backtestAbort.current === controller) backtestAbort.current = null; setBusy(""); setRunProgress(""); }
  }
  async function validate() {
    if (!selectedValidationRuns.length) return message("Select at least one development backtest to validate.");
    if (selectedValidationRuns.some((run) => !sameResearchWindow(selectedValidationRuns[0], run))) return message("Select backtests with the same full date range and development split for one portfolio validation.");
    setBusy("validation"); setError("");
    setValidationResults([]);
    const controller = new AbortController();
    validationAbort.current = controller;
    const completed: { source: Run; run: Run }[] = [];
    const failures: string[] = [];
    try {
      for (const [index, sourceRun] of selectedValidationRuns.entries()) {
        if (controller.signal.aborted) break;
        if (index) await pause(1000, controller.signal);
        const window = sourceRun.research!;
        try {
          const strategy = parseStrategy(sourceRun.strategySource!);
          const testSettings = { ...sourceRun.settings, start: window.boundary, end: window.fullEnd };
          const timeframe = sourceRun.granularity!;
          const storedDataset = sourceRun.datasetId ? datasets.find(dataset => dataset.id === sourceRun.datasetId) : undefined;
          if (sourceRun.datasetId && !storedDataset) throw new Error("The original dataset was removed. Restore it before validating this run.");
          const bars = storedDataset ? storedDataset.bars.filter(bar => bar.time >= testSettings.start && bar.time <= testSettings.end) : await loadOnlineBars(apiFetch, sourceRun.symbol, timeframe, testSettings.start, testSettings.end, controller.signal, (loaded, estimated) => setValidationProgress(`${index + 1} of ${selectedValidationRuns.length}: ${sourceRun.symbol} · ${loaded.toLocaleString()} / ~${estimated.toLocaleString()} candles`));

          if (bars.length < 20) throw new Error("The reserved holdout has fewer than 20 candles.");
          setValidationProgress(`${index + 1} of ${selectedValidationRuns.length}: ${sourceRun.symbol} · calculating`);
          const result = await execute({ ...(storedDataset || { ...onlineDataset(sourceRun.symbol), fileName: `Coinbase · ${timeframe / 60}m` }), bars }, strategy, testSettings, sourceRun.strategyId, `Validation · ${sourceRun.name}`, controller.signal);
          if (controller.signal.aborted) break;
          result.granularity = timeframe;
          result.datasetId = sourceRun.datasetId;
          result.strategySource = sourceRun.strategySource;
          result.research = { ...window, phase: "validation", parentRunId: sourceRun.id };
          completed.push({ source: sourceRun, run: result });
          setValidationResults([...completed]);
        } catch (error) { if (controller.signal.aborted) break; failures.push(`${sourceRun.symbol}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (completed.length) setNotice(`${completed.length} reserved-period validation${completed.length === 1 ? "" : "s"} completed.${controller.signal.aborted ? " Remaining runs cancelled." : ""}`);
      else if (controller.signal.aborted) setNotice("Validation cancelled.");
      if (failures.length) setError(failures.slice(0, 5).join(" · "));
    } catch (e) { if (controller.signal.aborted) setNotice(completed.length ? `${completed.length} validations completed. Remaining runs cancelled.` : "Validation cancelled."); else message(e); }
    finally { if (validationAbort.current === controller) validationAbort.current = null; setBusy(""); setValidationProgress(""); }
  }
  function cancelValidation() { validationAbort.current?.abort(); setValidationProgress("Cancelling"); }
  async function removeDataset() { if (!selectedDataset) return; try { await localStore.deleteDataset(selectedDataset.id); await refresh(); setNotice("Dataset removed."); setError(""); } catch (e) { message(e); } }
  async function deleteLibraryStrategy(id: string) {
    const strategy = strategies.find(s => s.id === id); if (!strategy) return; await strategyStore.deleteStrategy(strategy);
    await refresh();
    setNotice("Strategy removed. Saved backtest results are unchanged."); setError("");
  }
  async function removeRun(id: string) { try { const run = runs.find(r => r.id === id); if (run?.cloudLinked) await cloudRequest(apiFetch, {action:"delete", id}); await localStore.deleteRun(id); setCompareIds(current=>current.filter(item=>item!==id)); await refresh(); setNotice("Run removed."); setError(""); } catch (e) { message(e); } }
  async function clearHistory() { if (!runs.length) return; try { if (cloudAvailable) await cloudRequest(apiFetch, {action:"delete_all"}); await localStore.clearRuns(); setPortfolioIds([]); setCompareIds([]); await refresh(); setNotice("All saved backtests deleted."); setError(""); } catch (e) { message(e); } }
  async function renameRun() {
    const run = runs.find(item => item.id === renamingRunId);
    const name = renameValue.trim();
    if (!run || renameBusy) return;
    if (!name || name.length > 100) return message("Enter a run name between 1 and 100 characters.");
    setRenameBusy(true);
    try {
      if (run.cloudLinked) await cloudRequest(apiFetch, { action: "rename", id: run.id, name });
      if (!run.summaryOnly) await localStore.putRun({ ...run, name });
      await refresh(); setRenamingRunId(""); setError(""); setNotice("Backtest renamed.");
    } catch (e) { message(e); } finally { setRenameBusy(false); }
  }

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
  async function exportBackup() { const [ds, ss, rs] = await Promise.all([localStore.datasets(), strategyStore.strategies(), localStore.runs()]); download("testify-backup.json", JSON.stringify({ format: "testify-backup-v1", datasets: ds, strategies: ss, runs: rs })); }
  function createDraft() { setStrategyId(""); setSource(JSON.stringify({ ...exampleStrategy, name: "New strategy" }, null, 2)); setPage("studio"); setError(""); }
  async function importStrategy(file: File, target: Page = "studio") {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Choose a strategy JSON file under 2 MB.");
      const parsed = parseStrategyImport(await file.text());
      let firstId = "";
      for (const strategy of parsed) { const id = crypto.randomUUID(); firstId ||= id; await strategyStore.putStrategy({ id, name: strategy.name, source: JSON.stringify(strategy, null, 2), updatedAt: Date.now() }); }
      await refresh(); setStrategyId(firstId); setSource(JSON.stringify(parsed[0], null, 2)); setError(""); setPage(target); setNotice(`Imported ${parsed.length} ${parsed.length === 1 ? "strategy" : "strategies"}.`);
    } catch (e) { if (target === "strategies") throw e; message(e); }
  }
  async function duplicateStrategy(strategy: SavedStrategy) {
    const copy = parseStrategy(JSON.stringify({ ...parseStrategy(strategy.source), name: duplicateStrategyName(strategy.name, strategies) }));
    await strategyStore.putStrategy({ id: crypto.randomUUID(), name: copy.name, source: JSON.stringify(copy, null, 2), updatedAt: Date.now() });
    await refresh(); setNotice("Strategy duplicated."); setError("");
  }
  async function importData(file: File) {
    try { if(file.size > 50 * 1024 * 1024) throw new Error("Choose a CSV file under 50 MB."); const dataset=parseMarketCsv(await file.text(), market, file.name); await localStore.putDataset(dataset); await refresh(); setDatasetId(dataset.id); setError(""); setNotice(`Imported ${dataset.bars.length.toLocaleString()} candles for ${dataset.symbol}.`); } catch(e) { message(e); }
  }
  function selectTestDataset(id: string) {
    setTestDatasetId(id);
    if (id === "online" && !intervals.some(([seconds])=>seconds===granularity)) setGranularity(3600);
    const dataset=datasets.find(item=>item.id===id);
    if(dataset) { const seconds=datasetCoverage(dataset).seconds; setGranularity(seconds); setStart(dateInput(dataset.bars[0].time)); setEnd(dateInput(dataset.bars[dataset.bars.length-1].time)); }
  }
  async function importBackup(file: File) { try { const data = JSON.parse(await file.text()) as { format: string; datasets: Dataset[]; strategies: SavedStrategy[]; runs: Run[] }; if (data.format !== "testify-backup-v1" || !Array.isArray(data.datasets) || !Array.isArray(data.strategies) || !Array.isArray(data.runs)) throw new Error("Invalid Testify backup."); for (const d of data.datasets) { if (!d.id || !Array.isArray(d.bars)) throw new Error("Invalid dataset in backup."); await localStore.putDataset(d); } for (const s of data.strategies) { parseStrategy(s.source); await strategyStore.putStrategy(s); } for (const r of data.runs) { if (!r.id || !Array.isArray(r.curve)) throw new Error("Invalid run in backup."); await localStore.putRun(r); } await refresh(); setNotice("Backup restored in this browser."); } catch (e) { message(e); } }


  useEffect(()=>{if(storageLoaded){try{localStorage.setItem(`testify-selected-run:${userId}`,runId);}catch{/* Selection works for this visit. */}}},[runId,storageLoaded]);
  useEffect(()=>{try{localStorage.setItem(`testify-compare-runs:${userId}`,JSON.stringify(compareIds));}catch{/* Selection works for this visit. */}},[compareIds]);
  useEffect(()=>()=>{backtestAbort.current?.abort();validationAbort.current?.abort();},[]);
  function improveSavedRun(run: Run) {
    const snapshot=run.strategySource || strategies.find(strategy=>strategy.id===run.strategyId)?.source;
    if(!snapshot)return message("The saved strategy version is unavailable for this run.");
    setSource(snapshot);setStrategyId("");setFeedbackIds([]);setPage("studio");setNotice("Draft opened from the saved run. Review and save it as a new strategy.");
  }
  async function reuseRunSettings(run: Run) {
    try {
      if(!run.strategySource)throw new Error("This older run has no saved strategy snapshot.");
      const parsed=parseStrategy(run.strategySource);
      let snapshot=strategies.find(strategy=>{try{return JSON.stringify(parseStrategy(strategy.source))===JSON.stringify(parsed);}catch{return false;}});
      if(!snapshot){snapshot={id:crypto.randomUUID(),name:`${parsed.name} · saved run`,source:run.strategySource,updatedAt:Date.now()};await localStore.putStrategy(snapshot);await refresh();}
      setStrategyId(snapshot.id);setSource(snapshot.source);setSelectedMarkets([run.symbol]);setMultiMarket(false);setGranularity(run.granularity||3600);setTestDatasetId(run.datasetId||"online");setCapital(run.settings.capital);setFeeBps(run.settings.feeBps);setFeeMode(run.settings.feePerTrade === undefined ? "percentage" : "fixed");setFeePerTrade(run.settings.feePerTrade ?? 1);setSlippageBps(run.settings.slippageBps);setStart(dateInput(run.research?.fullStart||run.settings.start));setEnd(dateInput(run.research?.fullEnd||run.settings.end));setSplitPct(run.research?.splitPct||60);setRunName(`${run.name} copy`);setPage("backtests");setNotice("Saved strategy version and settings restored.");
    }catch(error){message(error);}
  }
  const loadTradeBars = useMemo(() => async (run: Run, trade: Run["trades"][number], signal: AbortSignal) => {
    const timeframe=run.granularity||3600;
    const start=Math.max(run.settings.start,trade.entryTime-20*timeframe);
    const end=Math.min(run.settings.end,trade.exitTime+20*timeframe);
    const snapshotId=run.datasetId||run.priceDatasetId;
    if(snapshotId){const dataset=datasets.find(dataset=>dataset.id===snapshotId);if(!dataset)throw new Error("The saved candle dataset was removed. Restore it to inspect this trade.");return dataset.bars.filter(bar=>bar.time>=start&&bar.time<=end);}
    return loadOnlineBars(apiFetch, run.symbol,timeframe,start,end,signal);
  },[datasets]);
  function renderValidationPage() {
    const comparedDevelopment = combinePortfolio(validationResults.map((item) => item.source));
    const window = selectedValidationRuns[0]?.research;
    return <>
      <div className="page-header"><div><div className="eyebrow">OUT OF SAMPLE CHECK</div><h1>Validation</h1><p>Choose saved development runs. Test those exact strategy versions on their reserved later period, then combine the results as a portfolio.</p></div></div>
      <div className="research-layout"><section className="panel config-panel"><div className="panel-head"><div><div className="overline">CONFIGURE</div><h3>Reserved period</h3></div></div><div className="form-stack">
        <label>Development share: {splitPct}%<RangeSlider min="30" max="80" step="5" value={splitPct} onChange={(event) => setSplitPct(Number(event.target.value))}/></label>
        <p className="help">This setting applies to future Backtests. Saved runs keep their original split and strategy version.</p>
        <RunPicker title="Development runs" runs={validationEligible} selectedIds={validationIds} onChange={setValidationIds} emptyText="Run a new development backtest first."/>
        {window && <p className="help">Selected split: {window.splitPct}% development through {date(window.boundary)}. Holdout: {date(window.boundary)} to {date(window.fullEnd)}. Select runs from the same full range to combine them.</p>}
        <button className="button primary dashboard-primary testify-primary full" disabled={busy === "validation" || !selectedValidationRuns.length} onClick={() => void validate()}><FlaskConical size={15}/>{busy === "validation" ? `Validating ${validationProgress}…` : `Validate ${selectedValidationRuns.length} run${selectedValidationRuns.length === 1 ? "" : "s"}`}</button>

        {busy === "validation" && <button className="button ghost full" onClick={cancelValidation}><Square size={15}/> Cancel validation</button>}
        <p className="help">Gemini never receives these reserved-period results. Reviewing the holdout and then tuning again makes it development data.</p>
      </div></section><div className="research-main"><section className="panel"><div className="panel-head"><div><div className="overline">PORTFOLIO VALIDATION</div><h3>{validationResults.length ? `${validationResults.length} holdout result${validationResults.length === 1 ? "" : "s"}` : "No validation yet"}</h3></div>{validationResults.length > 0 && <button className="button subtle" onClick={() => download("testify-validation.json", JSON.stringify({ sourceRunIds: validationResults.map((item) => item.source.id), runs: validationResults.map((item) => item.run), portfolio: validatedPortfolio }, null, 2))}><Download size={14}/> Export</button>}</div>
        {validationResults.length ? <><div className="metrics four inset"><Metric label="DEVELOPMENT RETURN" value={pct(comparedDevelopment.returnPct)}/><Metric label="HOLDOUT RETURN" value={pct(validatedPortfolio.returnPct)}/><Metric label="HOLDOUT DRAWDOWN" value={`${fmt(validatedPortfolio.maxDrawdownPct)}%`}/><Metric label="VALIDATED RUNS" value={String(validationResults.length)}/></div><Chart curves={[{ name: "Development portfolio", points: comparedDevelopment.curve }, { name: "Holdout portfolio", points: validatedPortfolio.curve }]}/><div className="inline-note">Each selected run uses a full starting-capital sleeve, as in Portfolio lab. The two curves cover separate periods; they are not a continuous account history.</div><div className="validation-results">{validationResults.map(({ source, run }) => <div key={source.id} className="validation-result"><div><strong>{run.symbol} · {source.name}</strong><small>{run.strategyName} · {run.granularity ? timeframeName(run.granularity) : ""}</small></div><span>Development <AnimatedValue tone={metricTone("Return",source.metrics.netReturnPct)} value={pct(source.metrics.netReturnPct)}/></span><b className={run.metrics.netReturnPct > 0 ? "good" : "bad"}>Holdout <AnimatedValue tone={metricTone("Return",run.metrics.netReturnPct)} value={pct(run.metrics.netReturnPct)}/></b><small>{run.metrics.tradeCount} trades · {fmt(run.metrics.totalFees)} fees</small></div>)}</div></> : <div className="chart-empty">Select development runs to test their reserved holdout period.</div>}
      </section></div></div>
    </>;
  }



  const researchTools = <details className="design-card raised design-research-tools"><summary>Research tools</summary>
    <div className="design-research-controls">
    <label>Commission mode<select value={feeMode} onChange={e => setFeeMode(e.target.value as "fixed" | "percentage")}><option value="percentage">Percentage per side</option><option value="fixed">Fixed per trade</option></select></label>
    {feeMode === "fixed" && <label>Fee per trade<input type="number" min="0" value={feePerTrade} onChange={e => setFeePerTrade(Number(e.target.value))}/></label>}
    <label><input type="checkbox" checked={autoSlippage} onChange={e => setAutoSlippage(e.target.checked)}/> Estimate slippage from market depth</label>
    <label>AI research context<select value={feedbackMode} onChange={e => setFeedbackMode(e.target.value as "runs" | "portfolio")}><option value="runs">Selected development runs</option><option value="portfolio">Development portfolio</option></select></label>
    <button className="design-button" disabled={!!busy || !idea.trim()} onClick={() => void askGeminiQuestion()}>Discuss strategy with AI</button>
    {consultation.map((message,i) => <p key={i}>{message.role}: {message.text}</p>)}
    <button className="design-button" disabled={!!busy || !runs.length} onClick={() => void uploadHistorySummaries()}>Sync history summaries</button>
    <label>Backtest to rename<select value={renamingRunId} onChange={e => {setRenamingRunId(e.target.value);setRenameValue(runs.find(run=>run.id===e.target.value)?.name || "");}}><option value="">Select a run</option>{runs.map(run => <option key={run.id} value={run.id}>{run.name}</option>)}</select></label>
    {renamingRunId && <><label>New backtest name<input value={renameValue} onChange={e => setRenameValue(e.target.value)} maxLength={100}/></label><button className="design-button" disabled={renameBusy} onClick={() => void renameRun()}>Rename backtest</button></>}
    </div></details>;
  if (!storageLoaded && page !== "strategies") return <div className="site-loading" role="status">Opening your workspace…</div>;
  if (["overview","strategies","studio","backtests","runsettings","trades","connections"].includes(page)) return <PenpotWorkspace apiFetch={apiFetch} accountControls={accountControls} researchTools={researchTools} content={<Connections apiFetch={apiFetch}/>}
    studio={<Suspense fallback={<p role="status">Opening strategy editor…</p>}><PenpotStrategyStudio source={source} onChange={setSource} strategies={strategies} selected={selectedStrategy} onOpen={setStrategyId}
      onValidate={() => void validateDraft()} onSave={() => void saveStrategy()}
      mode={studioMode} onMode={setStudioMode} idea={idea} onIdea={setIdea} busy={busy.startsWith("gemini")} onGenerate={() => void askGemini()} onImprove={() => void askGeminiRevision()}
      canImprove={!!selectedStrategy && !!selectedFeedbackRuns.length} feedbackCount={selectedFeedbackRuns.length}
      feedbackPicker={<RunPicker title="Backtests for Gemini" runs={feedbackEligible} selectedIds={feedbackIds} onChange={setFeedbackIds} emptyText="Save and backtest this strategy version on the development period first."/>} /></Suspense>}
    loading={libraryLoading} loadError={libraryLoadError} onRetry={loadWorkspace} datasets={datasets}
    page={page} navigate={setPage} strategies={strategies} runs={runs} selectedRun={selectedRun}
    options={{strategyId,markets:selectedMarkets,granularity,capital,start,end,feeBps,feeMode,feePerTrade,slippageBps,splitPct,name:runName,datasetId:testDatasetId}}
    update={(key:keyof RunOptions,value:string|number|string[])=>{
      if(key==="strategyId")setStrategyId(String(value));
      else if(key==="markets"){setSelectedMarkets(value as string[]);setMultiMarket((value as string[]).length>1);}
      else if(key==="granularity")setGranularity(Number(value));
      else if(key==="capital")setCapital(Number(value));
      else if(key==="start")setStart(String(value));
      else if(key==="end")setEnd(String(value));
      else if(key==="feeBps")setFeeBps(Number(value));
      else if(key==="slippageBps")setSlippageBps(Number(value));
      else if(key==="splitPct")setSplitPct(Number(value));
      else if(key==="name")setRunName(String(value));
      else if(key==="datasetId") {
        setTestDatasetId(String(value));
        const chosen=datasets.find(dataset=>dataset.id===value);
        if(chosen?.bars.length) {
          setStart(dateInput(chosen.bars[0].time));
          setEnd(dateInput(chosen.bars[chosen.bars.length-1].time));
          setSelectedMarkets([chosen.symbol]);setMultiMarket(false);setGranularity(chosen.bars.length>1 ? Math.max(1,chosen.bars[1].time-chosen.bars[0].time) : 3600);
        }
      }
    }} markets={markets} error={error} notice={notice}
    onCreate={createDraft} onOpen={id=>{setStrategyId(id);setSource(strategies.find(s=>s.id===id)!.source);setPage("studio");}}
    onRun={()=>void runTest()} onCancel={cancelBacktest} running={busy==="backtest"} progress={runPercent} progressText={runProgress}
    onImport={async file=>{try{await importStrategy(file,"strategies");}catch(e){message(e);}}} onExport={ids=>{const selected=strategies.filter(s=>ids.includes(s.id));if(selected.length)download(selected.length===1?`${selected[0].name.replace(/\W+/g,"-")}.json`:"testify-strategies.json",selected.length===1?selected[0].source:JSON.stringify(selected.map(s=>JSON.parse(s.source)),null,2));}}
    onDelete={deleteLibraryStrategy} onDuplicate={duplicateStrategy} onDraft={draft=>{setSource(draft);setStrategyId("");setPage("studio");}}
    onBackup={exportBackup} loadBars={loadTradeBars}
  />;
  if (page === "overview" && !runs.length) return <EmptyDashboard strategyCount={strategies.length} error={error} onNavigate={(target) => { setPage(target); setError(""); }} onBackup={exportBackup} onImport={importStrategy} />;
  return <WorkspaceShell accountControls={accountControls} page={page} onNavigate={(target) => { setPage(target === "backtests" && runs.length ? "history" : target); setError(""); }} onBackup={exportBackup}>
      {error && <div className="banner error" role="alert"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}{notice && <div className="banner success" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
      {strategyToDelete && <ConfirmStrategyDelete strategy={strategyToDelete} onDelete={deleteLibraryStrategy} onClose={() => setStrategyToDelete(null)} />}
      {page === "overview" && <ReturningDashboard strategies={strategies} runs={runs} onCreate={createDraft} onBacktest={() => setPage("backtests")} onOpenStrategy={id => { setStrategyId(id); setPage("studio"); }} onOpenRun={run => { setRunId(run.id); setPage("results"); }} onBackup={exportBackup} onRestore={importBackup}/>}
      {page === "strategies" && <StrategiesPage strategies={strategies} runs={runs} loading={libraryLoading} loadError={libraryLoadError} onRetry={loadWorkspace} onBacktest={(id)=>{ setStrategyId(id); setMultiMarket(false); setPage("backtests"); setError(""); }} onCreate={createDraft} onOpen={(id)=>{ setStrategyId(id); setSource(strategies.find(strategy=>strategy.id===id)!.source); setPage("studio"); }} onDuplicate={duplicateStrategy} onDelete={deleteLibraryStrategy} onImport={(file)=>importStrategy(file,"strategies")} onExport={(ids)=>{ const selected=strategies.filter(strategy=>ids.includes(strategy.id)); download(selected.length===1 ? `${selected[0].name.replace(/\W+/g,"-")}.json` : "testify-strategies.json", selected.length===1 ? selected[0].source : JSON.stringify(selected.map(strategy=>JSON.parse(strategy.source)),null,2)); }} />}
{page === "data" && <DataPage datasets={datasets} selected={selectedDataset} market={market} setMarket={setMarket} markets={markets} onImport={importData} onSelect={setDatasetId} onRemove={removeDataset} chart={selectedDataset ? <PriceChart dataset={selectedDataset}/> : null} onlineForm={<div className="form-stack"><label>Market<AnimatedSelect aria-label="Market" value={market} onChange={e=>setMarket(e.target.value)}>{[...new Set([market,...markets])].map(symbol=><option key={symbol}>{symbol}</option>)}</AnimatedSelect></label><label>Interval<AnimatedSelect aria-label="Interval" value={granularity} onChange={e=>setGranularity(Number(e.target.value))}>{intervals.map(([value,label])=><option key={value} value={value}>{label}</option>)}</AnimatedSelect></label><div className="form-split"><label>Start<DateTimePicker aria-label="Start" value={historyStart} onChange={e=>setHistoryStart(e.target.value)}/></label><label>End<DateTimePicker aria-label="End" value={historyEnd} onChange={e=>setHistoryEnd(e.target.value)}/></label></div><button className="button primary dashboard-primary testify-primary" disabled={busy==="data"} onClick={()=>void loadCrypto()}>{busy==="data" ? "Loading…" : "Load market data"}</button><p className="help">Historical candles load in batches. Times are stored in UTC.</p></div>} />}

      {page === "backtests" && busy === "backtest" && <BacktestProgress name={activeRunContext.name} description={activeRunContext.description} progress={runProgress} percent={runPercent} onCancel={cancelBacktest}/> }
      {page === "backtests" && busy !== "backtest" && <BacktestsPage running={busy==="backtest"} onRun={()=>void runTest()} onCancel={cancelBacktest} onNavigate={setPage} multi={multiMarket} onMode={(multi)=>{ setMultiMarket(multi); if(multi) selectTestDataset("online"); else setSelectedMarkets(current=>current.slice(0,1)); }} configuration={<div className="workspace-form-grid">
<label>Strategy and version<AnimatedSelect aria-label="Strategy and version" value={strategyId} onChange={e=>setStrategyId(e.target.value)}><option value="">Choose a saved strategy</option>{strategies.map(strategy=><option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</AnimatedSelect></label>
<label>Market / dataset<AnimatedSelect aria-label="Market / dataset" value={testDatasetId} onChange={e=>selectTestDataset(e.target.value)} disabled={multiMarket}><option value="online">Online market data</option>{datasets.map(dataset=><option key={dataset.id} value={dataset.id}>{dataset.symbol} · {dataset.fileName}</option>)}</AnimatedSelect></label>
<label>Timeframe<AnimatedSelect aria-label="Timeframe" value={granularity} disabled={testDatasetId!=="online"} onChange={e=>changeGranularity(Number(e.target.value))}>{!intervals.some(([seconds])=>seconds===granularity) && <option value={granularity}>{timeframeName(granularity)}</option>}{intervals.map(([value,label])=><option key={value} value={value}>{label}</option>)}</AnimatedSelect></label>
{testDatasetId==="online" && (multiMarket ? <div className="market-picker wide"><div className="market-picker-head"><strong>Markets ({selectedMarkets.length} selected)</strong><div className="button-row"><button className="button subtle" onClick={()=>setSelectedMarkets([...markets])}>Check all</button><button className="button ghost" onClick={()=>setSelectedMarkets([])}>Uncheck all</button></div></div><input className="market-search" aria-label="Search markets" placeholder="Search symbols…" value={marketSearch} onChange={e=>setMarketSearch(e.target.value)}/><div className="market-options">{visibleMarkets.map(symbol=><label className="market-check" key={symbol}><input type="checkbox" checked={selectedMarkets.includes(symbol)} onChange={e=>setSelectedMarkets(current=>e.target.checked ? [...current,symbol] : current.filter(item=>item!==symbol))}/>{symbol}</label>)}</div></div> : <label className="wide">Market<AnimatedSelect aria-label="Market" value={selectedMarkets[0] || ""} onChange={e=>setSelectedMarkets([e.target.value])}><option value="">Choose a market</option>{markets.map(symbol=><option key={symbol}>{symbol}</option>)}</AnimatedSelect></label>)}
<label>Start date<DateTimePicker aria-label="Start date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>End date<DateTimePicker aria-label="End date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
<label>Starting capital<input type="number" min="1" value={capital} onChange={e=>setCapital(Number(e.target.value))}/></label><label>Run name<input value={runName} onChange={e=>setRunName(e.target.value)}/></label>
<label>Fee / side (basis points)<input type="number" min="0" step="0.1" value={feeBps} onChange={e=>setFeeBps(Number(e.target.value))}/></label><label>Slippage / fill (basis points)<input type="number" min="0" step="0.1" value={slippageBps} onChange={e=>setSlippageBps(Number(e.target.value))}/></label>
<label className="wide">Development share: {splitPct}%<RangeSlider min="30" max="80" step="5" value={splitPct} onChange={e=>setSplitPct(Number(e.target.value))}/></label><div className="wide split-caption"><span>Development {splitPct}%</span><span>Reserved validation {100-splitPct}%</span></div>
</div>} summary={<><p>{selectedStrategy?.name || "Choose a saved strategy"}</p><p>{testDatasetId==="online" ? selectedMarkets.join(", ") || "Choose a market" : datasets.find(dataset=>dataset.id===testDatasetId)?.symbol} · {timeframeName(granularity)}</p><p>{start.replace("T"," ")} – {end.replace("T"," ")}</p><p>{multiMarket ? "Multiple market historical tests" : "Automatic historical test"}</p><div className="run-availability"><strong>{testDatasetId==="online" ? "Online historical data" : "Saved historical data"}</strong><p>{testDatasetId==="online" ? "Candles are loaded for your development period when the test starts." : `${datasets.find(dataset=>dataset.id===testDatasetId)?.bars.length.toLocaleString()} candles stored in this browser.`}</p><p>Your saved strategy is recorded with the run. Orders fill from the next bar.</p>{busy==="backtest" && <p role="status">{runProgress}</p>}</div></>}  />}
{page === "validation" && renderValidationPage()}
{page === "history" && <BacktestHistory runs={runs} selected={compareIds.filter(id=>runs.some(run=>run.id===id))} onSelect={setCompareIds} onOpen={(run)=>{setRunId(run.id);setPage("results");}} onCompare={()=>setPage("compare")} onNew={()=>setPage("backtests")} onDelete={removeRun} onClear={clearHistory}/>}
{page === "results" && <BacktestResults key={runId} run={selectedRun} datasetsLabel={datasets.find(dataset=>dataset.id===(selectedRun?.datasetId||selectedRun?.priceDatasetId))?.fileName} onImprove={improveSavedRun} onHistory={()=>setPage("history")} onCompare={(run)=>{setCompareIds(ids=>ids.includes(run.id)?ids:[run.id,...ids]);setPage("compare");}} onReuse={reuseRunSettings} onValidate={()=>{setValidationIds(selectedRun?[selectedRun.id]:[]);setPage("validation");}} onPortfolio={()=>setPage("portfolio")} loadBars={loadTradeBars}/>}
{page === "compare" && <CompareBacktests runs={runs} selected={compareIds} onSelect={setCompareIds} onHistory={()=>setPage("history")}/>}
{page === "portfolio" && <><div className="page-header"><div><div className="eyebrow">PORTFOLIO LAB</div><h1>Portfolio equity</h1><p>Select runs for a portfolio view, or filter by your custom Run name to display one saved backtest.</p></div></div><div className="two-col portfolio-layout"><section className="panel"><div className="panel-head"><div><div className="overline">SELECT</div><h3>Saved runs</h3></div><button className="button subtle" type="button" aria-pressed={portfolioAll} onClick={() => { setPortfolioAll((current) => !current); setPortfolioIds([]); setPortfolioDisplayRunId(""); setPortfolioNameFilter(""); }}>{portfolioAll ? "All selected" : "Select all"}</button></div><div className="portfolio-list">{runs.map((r) => <label key={r.id}><input type="checkbox" checked={portfolioAll || portfolioIds.includes(r.id)} onChange={(e) => togglePortfolioRun(r.id, e.target.checked)}/><div><strong>{r.name}</strong><small>{r.symbol} · {r.granularity ? timeframeName(r.granularity) + " · " : ""}{r.strategyName}</small></div><b className={r.metrics.netReturnPct > 0 ? "good" : "bad"}><AnimatedValue tone={metricTone("Return",r.metrics.netReturnPct)} value={pct(r.metrics.netReturnPct)}/></b></label>)}{!runs.length && <p className="empty-copy">Run backtests first to compare them.</p>}</div></section><section className="panel"><div className="panel-head"><div><div className="overline">VIEW</div><h3>{portfolioMode === "overlay" ? "Individual equity curves" : "Combined portfolio curve"}</h3></div></div><div className="portfolio-filter"><label>Filter by Run name<input type="search" value={portfolioNameFilter} onChange={(e) => filterPortfolioByName(e.target.value)} placeholder="Search your run names…"/></label><label>Display run<AnimatedSelect aria-label="Display run" value={activeDisplayRunId} onChange={(e) => { setPortfolioDisplayRunId(e.target.value); if (!e.target.value) setPortfolioNameFilter(""); }} disabled={!runs.length}><option value="">All selected runs</option>{matchingRunNames.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.symbol} · {new Date(r.createdAt).toLocaleString()}</option>)}</AnimatedSelect></label>{portfolioNameFilter.trim() && !matchingRunNames.length && <p className="help">No saved Run names match.</p>}</div><div className="mode-switch" role="group" aria-label="Portfolio view"><button className={portfolioMode === "overlay" ? "active" : ""} onClick={() => setPortfolioMode("overlay")}>Individual lines</button><button className={portfolioMode === "combined" ? "active" : ""} onClick={() => setPortfolioMode("combined")}>Combined portfolio</button></div>{portfolioMode === "overlay" ? <><Chart curves={displayedPortfolio.map((r) => ({ name: `${r.symbol} · ${r.name}`, points: r.curve, capital: r.settings.capital }))}/><div className="inline-note">Each line shows one independent backtest with its own starting capital.</div></> : <>{displayedPortfolio.length > 0 && <div className="metrics three inset"><Metric label="COMBINED RETURN" value={pct(combinedPortfolio.returnPct)}/><Metric label="MAX DRAWDOWN" value={`${fmt(combinedPortfolio.maxDrawdownPct)}%`}/><Metric label="SELECTED RUNS" value={String(displayedPortfolio.length)}/></div>}<Chart curves={combinedPortfolio.curve.length ? [{ name: "Combined portfolio", points: combinedPortfolio.curve }] : []}/><div className="inline-note">Each run contributes its percentage return against the same starting capital. A −10% run and a +15% run combine to +5%. This assumes full starting capital on every selected run, so total exposure grows with the number of runs. Curves are aligned by time; a run contributes 0% before it starts and holds its last value after it ends.</div></>}</section></div></>}
  </WorkspaceShell>;

}
