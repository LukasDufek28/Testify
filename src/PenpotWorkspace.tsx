import RunDefaultsPanel, {getDisplayTimezone} from "./RunDefaults";
import {aggregateRunPortfolio} from './portfolio';
import {dailySharpeEstimate} from './performance';
import {AnimatedSelect} from './AnimatedControls';
import WorkspaceSidebar from "./WorkspaceSidebar";
import type { ApiFetch } from "./api-client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  History,
  Menu,
  Search,
  X,
} from "lucide-react";
import { useAssistantContext } from "./AssistantWorkspace";
import {
  CardTitle,
  DesignCard,
  DesignEquity,
  DesignIcon,
  DesignMonthly,
  MetricCard,
  designIcons,
} from "./PenpotPrimitives";
import { latestStrategyRuns } from "./strategyLibrary";
import { savedRules, tradeR, tradeLevels, tradesCsv, formatTradePrice } from "./results";
import ConfirmStrategyDelete from "./ConfirmStrategyDelete";
import type { WorkspacePage } from "./WorkspaceShell";
import RunStatusBadge, { type RunState } from "./RunStatusBadge";
import useWorkspaceMotion from './useWorkspaceMotion';
import WorkspaceTopbar,{type WorkspaceSearchProps} from './WorkspaceTopbar';
import {motion,useReducedMotion} from 'motion/react';
import type { Bar, Dataset, Run, SavedStrategy, Trade } from "./types";
import './run-flow.css';

export type RunOptions = {
  strategyId: string;
  markets: string[];
  granularity: number;
  capital: number;
  riskPct:number; spreadBps:number;
  start: string;
  end: string;
  feeBps: number;
  feeMode?: "percentage" | "fixed"; feePerTrade?: number;
  slippageBps: number;
  splitPct: number;
  name: string;
  datasetId: string;
};
type Props = {
  search:WorkspaceSearchProps;librarySearch:string;onLibrarySearch:(query:string)=>void;
  userName:string;
  apiFetch: ApiFetch; accountControls?: ReactNode; researchTools?: ReactNode; batchTools?:ReactNode; content?: ReactNode;
  studio?: ReactNode;
  resultDetails?: ReactNode;
  loading: boolean;
  loadError: string;
  onRetry: () => Promise<void>;
  datasets: Dataset[];
  page: WorkspacePage;
  navigate: (page: WorkspacePage) => void;
  strategies: SavedStrategy[];
  runs: Run[];
  portfolio: ReturnType<typeof aggregateRunPortfolio>;
  selectedRun?: Run;
  options: RunOptions;
  update: (key: keyof RunOptions, value: string | number | string[]) => void;
  markets: string[];
  error: string;
  notice: string;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onRun: () => void;
  onCancel: () => void;
  running: boolean;
  runState: RunState;
  progress: number;
  progressText: string;
  onImport: (file: File) => Promise<void>;
  onExport: (ids: string[]) => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (strategy: SavedStrategy) => Promise<void>;
  onDraft: (source: string) => void;
  onBackup: () => Promise<void>;
  loadBars: (run: Run, trade: Trade, signal: AbortSignal) => Promise<Bar[]>;
};
const timeframe = (n: number) =>
  n < 3600 ? n / 60 + "m" : n < 86400 ? n / 3600 + "h" : n / 86400 + "d";
const profitFactor = (run: Run) => {
  const gains = run.trades.reduce((v, t) => v + Math.max(0, t.pnl), 0),
    losses = run.trades.reduce((v, t) => v - Math.min(0, t.pnl), 0);
  return losses ? (gains / losses).toFixed(2) : gains ? "∞" : "—";
};
const tradeDate = (time: number) =>
  new Date(time * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: getDisplayTimezone(),
  });
const money = (n: number,digits=0) =>
  (n<0?"-":"")+"$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits:digits,maximumFractionDigits:digits });
const percentage = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="design-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SettingsFields({
  p,
  advanced = false,
}: {
  p: Props;
  advanced?: boolean;
}) {
  const o = p.options;
  const strategyOptions = p.strategies.length
    ? p.strategies
    : [{ id: "", name: "Create a strategy first" }];
  const update = (key: keyof RunOptions, value: string | number | string[]) =>
    p.update(key, value);
  return (
    <>
      {!!p.datasets.length && (
        <Field label="Market / dataset">
          <AnimatedSelect
            aria-label="Market / dataset"
            value={o.datasetId}
            onChange={(e) => update("datasetId", e.target.value)}
          >
            <option value="online">Online market data</option>
            {p.datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.symbol} · {d.fileName}
              </option>
            ))}
          </AnimatedSelect>
        </Field>
      )}
      <Field label="Strategy">
        <AnimatedSelect
          aria-label="Strategy"
          value={o.strategyId}
          onChange={(e) => update("strategyId", e.target.value)}
        >
          {strategyOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </AnimatedSelect>
      </Field>
      <Field label={advanced ? "Timeframe" : "Market"}>
        {advanced ? (
          <AnimatedSelect
            aria-label="Timeframe"
            value={o.granularity}
            onChange={(e) => update("granularity", Number(e.target.value))}
          >
            {[
              [60, "1 minute"],
              [300, "5 minutes"],
              [900, "15 minutes"],
              [1800, "30 minutes"],
              [3600, "1 hour"],
              [14400, "4 hours"],
              [21600, "6 hours"],
              [86400, "1 day"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </AnimatedSelect>
        ) : (
          <AnimatedSelect
            aria-label="Market"
            value={o.markets[0] || "BTC-USD"}
            onChange={(e) => update("markets", [e.target.value])}
          >
            {[...new Set(["BTC-USD", ...p.markets])].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </AnimatedSelect>
        )}
      </Field>
      {advanced ? (
        <>
          <Field label="Start">
            <input
              type="datetime-local"
              aria-label="Start"
              value={o.start}
              onChange={(e) => update("start", e.target.value)}
            />
          </Field>
          <Field label="End">
            <input
              type="datetime-local"
              aria-label="End"
              value={o.end}
              onChange={(e) => update("end", e.target.value)}
            />
          </Field>
          <Field label={"Development share: " + o.splitPct + "%"}>
            <input
              type="range"
              min="30"
              max="80"
              step="5"
              value={o.splitPct}
              aria-label="Development share"
              onChange={(e) => update("splitPct", Number(e.target.value))}
            />
          </Field>
          <p className="design-help">
            Uses the first {o.splitPct}% of the date range.
            <br />
            The remaining {100 - o.splitPct}% is reserved for validation.
          </p>
        </>
      ) : (
        <>
          <Field label="Timeframe">
            <AnimatedSelect
              aria-label="Timeframe"
              value={o.granularity}
              onChange={(e) => update("granularity", Number(e.target.value))}
            >
              {[
                [60, "1 minute"],
                [300, "5 minutes"],
                [900, "15 minutes"],
                [1800, "30 minutes"],
                [3600, "1 hour"],
                [14400, "4 hours"],
                [21600, "6 hours"],
                [86400, "1 day"],
              ].map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </AnimatedSelect>
          </Field>
          <Field label="Starting balance">
            <input
              type="number"
              aria-label="Starting balance"
              min="1"
              value={o.capital}
              onChange={(e) => update("capital", Number(e.target.value))}
            />
          </Field>
          <Field label="Date range">
            <div className="design-date-pair">
              <input
                type="date"
                aria-label="Start date"
                value={o.start.slice(0, 10)}
                onChange={(e) => update("start", e.target.value + "T00:00")}
              />
              <input
                type="date"
                aria-label="End date"
                value={o.end.slice(0, 10)}
                onChange={(e) => update("end", e.target.value + "T00:00")}
              />
            </div>
          </Field>
        </>
      )}
    </>
  );
}
function Library({ p,search,setSearch }: { p: Props;search:string;setSearch:(value:string)=>void }) {
  const [market, setMarket] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [sort, setSort] = useState("recent"),
    [deleting, setDeleting] = useState<SavedStrategy | null>(null),
    [error, setError] = useState("");
  const latest = latestStrategyRuns(p.runs);
  useEffect(
    () =>
      setSelected((ids) =>
        ids.filter((id) => p.strategies.some((s) => s.id === id)),
      ),
    [p.strategies],
  );
  const list = p.strategies
    .filter(
      (s) =>
        search
          .toLowerCase()
          .trim()
          .split(/\s+/)
          .every((term) =>
            [
              s.name,
              latest.get(s.id)?.symbol,
              timeframe(latest.get(s.id)?.granularity || 3600),
            ]
              .join(" ")
              .toLowerCase()
              .includes(term),
          ) &&
        (!market || latest.get(s.id)?.symbol === market),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt - a.updatedAt,
    );
  return (
    <div className="design-library">
      <div className="design-library-toolbar">
        <div className="design-search">
          <input
            type="search"
            aria-label="Search strategies"
            placeholder="Search strategies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search size={15} />
        </div>
        <AnimatedSelect
          aria-label="Filter strategies by market"
          value={market}
          onChange={(e) => setMarket(e.target.value)}
        >
          <option value="">All markets</option>
          {[...new Set(p.runs.map((r) => r.symbol))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </AnimatedSelect>
        <AnimatedSelect
          aria-label="Sort strategies"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Recently updated</option>
          <option value="name">Name</option>
        </AnimatedSelect>
      </div>
      {error && (
        <p role="alert" className="design-error">
          {error}
        </p>
      )}
      <div className="design-strategy-grid">
        {!p.strategies.length ? <DesignCard className="design-library-empty"><DesignIcon icon={designIcons.layers}/><h2>Your first idea belongs here</h2><p>Create a strategy or import your own rules. Results appear only after you run a backtest.</p><button className="design-button" onClick={p.onCreate}>Create your first strategy</button></DesignCard> : list.map((s) => {
              const run = latest.get(s.id);
              return (
                <article
                  aria-label={s.name}
                  key={s.id}
                  className="design-strategy-article"
                >
                  <DesignCard
                    className={
                      "design-strategy-example strategy-card " +
                      (run && run.metrics.netReturnPct < 0
                        ? "loss-glow"
                        : "profit-glow")
                    }
                  >
                    <div className="design-strategy-title">
                      <DesignIcon icon={designIcons.trades} />
                      <h3>{s.name}</h3>
                      <input
                        type="checkbox"
                        aria-label={"Select " + s.name}
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected((v) =>
                            e.target.checked
                              ? [...v, s.id]
                              : v.filter((id) => id !== s.id),
                          )
                        }
                      />
                    </div>
                    <p>
                      {run
                        ? run.symbol +
                          " · " +
                          timeframe(run.granularity || 3600)
                        : "Choose a market when testing"}
                    </p>
                    <div className="design-strategy-stats">
                      <div>
                        <small>Return</small>
                        <strong>
                          {run
                            ? percentage(run.metrics.netReturnPct)
                            : "Not tested"}
                        </strong>
                      </div>
                      <div>
                        <small>Profit factor</small>
                        <strong>{run ? profitFactor(run) : "—"}</strong>
                      </div>
                      <div>
                        <small>Trades</small>
                        <strong>{run?.metrics.tradeCount ?? "—"}</strong>
                      </div>
                    </div>
                    <footer>
                      <details>
                        <summary
                          className="design-button secondary"
                          aria-label={"More actions for " + s.name}
                        >
                          More
                        </summary>
                        <div className="design-context-menu">
                          <button
                            onClick={(e) => {
                              e.currentTarget.closest("details")!.open = false;
                              void p
                                .onDuplicate(s)
                                .catch((e) => setError(String(e)));
                            }}
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => {
                              p.update("strategyId", s.id);
                              p.navigate("runsettings");
                            }}
                          >
                            New backtest
                          </button>
                          <button onClick={() => p.onExport([s.id])}>
                            Export JSON
                          </button>
                          <button
                            onClick={(e) => {
                              e.currentTarget.closest("details")!.open = false;
                              setDeleting(s);
                            }}
                          >
                            Delete strategy
                          </button>
                        </div>
                      </details>
                      <button
                        className="design-button secondary"
                        onClick={() => p.onOpen(s.id)}
                      >
                        Open
                      </button>
                    </footer>
                  </DesignCard>
                </article>
              );
            })}
      </div>
      {!!p.strategies.length && !list.length && (
        <DesignCard>
          <h2>No matching strategies</h2>
          <button
            className="design-button"
            onClick={() => {
              setSearch("");
              setMarket("");
            }}
          >
            Clear filters
          </button>
        </DesignCard>
      )}
      <DesignCard className="design-library-footer">
        <div>
          <h2>Keep testing. Keep improving.</h2>
          <p>Open a saved version or create your next idea with Gemini.</p>
        </div>
        <div>
          {!!selected.length && (
            <button
              className="design-button secondary"
              onClick={() => setSelected([])}
            >
              Clear selection ({selected.length})
            </button>
          )}
          <button
            className="design-button"
            disabled={!p.strategies.length}
            onClick={() => p.navigate("runsettings")}
          >
            Run backtest
          </button>
          <button
            className="design-button secondary"
            disabled={!selected.length}
            onClick={() => p.onExport(selected)}
          >
            Export selected
          </button>
        </div>
      </DesignCard>
      {deleting && (
        <ConfirmStrategyDelete
          strategy={deleting}
          onDelete={p.onDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
function Replay({ p }: { p: Props }) {
  const reduced=useReducedMotion();
  const trades = p.selectedRun?.trades || [];
  const [index, setIndex] = useState(0),
    [bar, setBar] = useState(37),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [bars, setBars] = useState<Bar[]>([]),
    [loadError, setLoadError] = useState("");
  const [direction,setDirection]=useState(''),[reason,setReason]=useState(''),[tablePage,setTablePage]=useState(0);
  const filtered=trades.map((trade,index)=>({trade,index})).filter(({trade})=>(!direction||String(trade.side)===direction)&&(!reason||trade.reason===reason));
  const trade = trades[Math.min(index, trades.length - 1)];
  useEffect(() => {
    if (!p.selectedRun || !trade) return;
    const abort = new AbortController();
    setLoadError("");
    setBars([]);
    p.loadBars(p.selectedRun, trade, abort.signal)
      .then(loaded=>{if(!abort.signal.aborted){setBars(loaded);setBar(loaded.length);}})
      .catch((e) => {
        if (!abort.signal.aborted) setLoadError(String(e));
      });
    return () => abort.abort();
  }, [p.selectedRun?.id, trade]);
  const count = bars.length;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setBar((v) => {
          if (v >= count) {
            setPlaying(false);
            return v;
          }
          return v + 1;
        }),
      700 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, count]);
  function select(i: number) {
    setIndex(Math.max(0, Math.min(trades.length - 1, i)));
    setBar(p.selectedRun ? 1 : 37);
    setPlaying(false);
  }
  useEffect(() => {
    setIndex(0);
    setDirection('');setReason('');setTablePage(0);
    setBar(p.selectedRun ? 1 : 37);
    setPlaying(false);
  }, [p.selectedRun?.id]);
  const candles = bars;
  const startIndex = Math.max(0, Math.min(bar, candles.length) - 80);
  const visibleCandles = candles.slice(
    startIndex,
    Math.min(bar, candles.length),
  );
  const rules = p.selectedRun ? savedRules(p.selectedRun) : null;
  const {stopLoss,takeProfit}=p.selectedRun&&trade?tradeLevels(p.selectedRun,trade):{stopLoss:null,takeProfit:null};
  const tradePrices=[trade?.entry,trade?.exit,stopLoss,takeProfit].filter((value):value is number=>typeof value==='number'&&Number.isFinite(value));
  const extrema = candles.reduce(
    (range, candle) => ({
      min: Math.min(range.min, candle.low),
      max: Math.max(range.max, candle.high),
    }),
    { min: Math.min(Infinity,...tradePrices), max: Math.max(-Infinity,...tradePrices) },
  );
  const padding = candles.length
    ? Math.max((extrema.max - extrema.min) * 0.15, extrema.max * 0.001)
    : 1;
  const low = p.selectedRun
    ? candles.length
      ? extrema.min - padding
      : 0
    : 80000;
  const high = p.selectedRun
    ? candles.length
      ? extrema.max + padding
      : 1
    : 88000;
  const cy = (v: number) => 240 - ((v - low) / (high - low)) * 220;
  const cx = (i: number) =>
    p.selectedRun
      ? 67.5 + (i / Math.max(1, Math.min(80, candles.length) - 1)) * 666
      : 67.5 + i * 15.5;
  const marker = (time: number) => {
    const i = candles.findIndex((candle) => candle.time >= time);
    return i >= startIndex && i < Math.min(bar, candles.length)
      ? cx(i - startIndex)
      : undefined;
  };
  const rMultiple =
    trade && p.selectedRun ? tradeR(p.selectedRun, trade) : trade?.returnPct;
  function exportTrades() {
    const content = p.selectedRun
      ? tradesCsv(p.selectedRun)
      : "Entry UTC,Side,Entry,Exit,Net P/L,Exit reason\n" +
        trades
          .map((t) =>
            [
              new Date(t.entryTime * 1000).toISOString(),
              t.side === 1 ? "Long" : "Short",
              t.entry,
              t.exit,
              t.pnl,
              t.reason,
            ].join(","),
          )
          .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    a.download = "testify-trades.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }
  return (
    <>
      <div className="design-replay-grid">
        <DesignCard className="design-replay">
          <div className="design-replay-header">
            <div>
              <CardTitle icon={designIcons.chart}>
                {p.selectedRun?.symbol || "BTC-USD"} ·{" "}
                {timeframe(p.selectedRun?.granularity || 3600)}
              </CardTitle>
              <small>
                {playing ? "Playing" : "Paused"} ·{" "}
                {p.selectedRun
                  ? bars[Math.min(bar - 1, bars.length - 1)]
                    ? tradeDate(bars[Math.min(bar - 1, bars.length - 1)].time)
                    : "Loading saved candles…"
                  : "05 Mar 2026 · 00:00"}
              </small>
            </div>
            <div>
              {[
                ["play", playing ? "Pause" : "Play"],
                ["next", "Next bar"],
                ["speed", "Speed · " + speed + "x"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className="design-button secondary"
                  disabled={!count}
                  onClick={() =>
                    key === "play"
                      ? (()=>{if(!playing&&bar>=count)setBar(1);setPlaying((v) => !v);})()
                      : key === "next"
                        ? setBar((v) => Math.min(count, v + 1))
                        : setSpeed((v) => (v === 4 ? 1 : v * 2))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loadError && (
            <p role="alert" className="design-error">
              {loadError}
            </p>
          )}
          {p.selectedRun && !bars.length && (
            <p className="design-replay-empty" role="status">
              {loadError
                ? "Saved candles unavailable"
                : !trades.length
                  ? "This run has no trades"
                  : "Loading saved candles…"}
            </p>
          )}
          <svg
            className="design-candles"
            role="img"
            aria-label="Trade replay candlestick chart"
            viewBox="0 0 794 292"
          >
            <defs>
              <linearGradient id="candle-up" x2="0" y2="1">
                <stop stopColor="#6656c8" />
                <stop offset="1" stopColor="#41349d" />
              </linearGradient>
              <linearGradient id="candle-down" x2="0" y2="1">
                <stop stopColor="#45444f" />
                <stop offset="1" stopColor="#2b2a33" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line
                  x1="55"
                  x2="759"
                  y1={20 + i * 55}
                  y2={20 + i * 55}
                  stroke="#36353f"
                />
                <text x="0" y={24 + i * 55} fill="#9e9da7" fontSize="12">
                  {p.selectedRun
                    ? high>0&&high<.001?(high-i*(high-low)/4).toExponential(2):(high - (i * (high - low)) / 4).toLocaleString("en-US", {
                        maximumFractionDigits: high < 10 ? 6 : 0,
                      })
                    : `${88 - i * 2}k`}
                </text>
              </g>
            ))}
            {visibleCandles.map((b, i) => {
              const x = cx(i);
              return (
                <g key={b.time} data-candle-time={b.time}>
                  <line
                    x1={x}
                    x2={x}
                    y1={cy(b.high)}
                    y2={cy(b.low)}
                    stroke={b.close >= b.open ? "#6656c8" : "#45444f"}
                  />
                  <rect
                    x={x - 3.5}
                    y={Math.min(cy(b.open), cy(b.close))}
                    width="7"
                    height={Math.max(2, Math.abs(cy(b.open) - cy(b.close)))}
                    fill={
                      b.close >= b.open
                        ? "url(#candle-up)"
                        : "url(#candle-down)"
                    }
                  />
                </g>
              );
            })}
            {p.selectedRun && trade && (
              <>
                {[
                  [stopLoss, "SL", "#e69a9a"],
                  [takeProfit, "TP", "#91f5ab"],
                ].map(([price, label, color]) =>
                  typeof price === "number" &&
                  price >= low &&
                  price <= high &&
                  marker(trade.entryTime) !== undefined ? (
                    <g key={label} data-level={label}>
                      <line
                        x1={marker(trade.entryTime)}
                        x2="759"
                        y1={cy(price)}
                        y2={cy(price)}
                        stroke={String(color)}
                        strokeDasharray="5 5"
                        opacity=".65"
                      />
                      <text
                        x="762"
                        y={cy(price) + 4}
                        fill={String(color)}
                        fontSize="12"
                      >
                        {label}
                      </text>
                    </g>
                  ) : null,
                )}
                {marker(trade.entryTime) !== undefined && (
                  <g data-marker="entry">
                    <circle
                      cx={marker(trade.entryTime)}
                      cy={cy(trade.entry)}
                      r="3"
                      fill="#f9f9fa"
                    />
                    <text
                      x={marker(trade.entryTime)}
                      y={cy(trade.entry) + 23}
                      textAnchor="middle"
                      fill="#f9f9fa"
                      fontSize="14"
                    >
                      {trade.side === 1 ? "Buy" : "Sell"}
                    </text>
                  </g>
                )}
                {marker(trade.exitTime) !== undefined && (
                  <g data-marker="exit">
                    <circle
                      cx={marker(trade.exitTime)}
                      cy={cy(trade.exit)}
                      r="3"
                      fill={
                        trade.reason === "Stop loss" ? "#e69a9a" : "#91f5ab"
                      }
                    />
                    <text
                      x={marker(trade.exitTime)}
                      y={cy(trade.exit) - 14}
                      textAnchor="middle"
                      fill={
                        trade.reason === "Stop loss" ? "#e69a9a" : "#91f5ab"
                      }
                      fontSize="12"
                    >
                      {trade.reason === "Take profit"
                        ? "TP"
                        : trade.reason === "Stop loss"
                          ? "SL"
                          : "Exit"}
                    </text>
                  </g>
                )}
              </>
            )}
            {!p.selectedRun && (
              <>
                {bar >= 12 && (
                  <g>
                    <circle cx="237.5" cy="176.599" r="3" fill="#f9f9fa" />
                    <text
                      x="237.5"
                      y="200.6"
                      textAnchor="middle"
                      fill="#f9f9fa"
                      fontSize="14"
                    >
                      Buy
                    </text>
                  </g>
                )}
                {bar >= 37 && (
                  <g>
                    <circle cx="625" cy="81.6" r="3" fill="#91f5ab" />
                    <text
                      x="625"
                      y="69"
                      textAnchor="middle"
                      fill="#91f5ab"
                      fontSize="12"
                    >
                      TP
                    </text>
                  </g>
                )}
              </>
            )}
            {["04 Mar", "06:00", "12:00", "18:00", "05 Mar", "06:00"].map(
              (t, i) => (
                <text
                  key={i}
                  x={55 + i * 139}
                  y="271"
                  textAnchor={i===0?'start':i===5?'end':'middle'}
                  fill="#9e9da7"
                  fontSize="12"
                >
                  {p.selectedRun
                    ? visibleCandles[
                        Math.round(
                          (i / 5) * Math.max(0, visibleCandles.length - 1),
                        )
                      ]
                      ? tradeDate(
                          visibleCandles[
                            Math.round(
                              (i / 5) * Math.max(0, visibleCandles.length - 1),
                            )
                          ].time,
                        )
                      : ""
                    : t}
                </text>
              ),
            )}
          </svg>
          <input
            type="range"
            min="1"
            max={Math.max(1, count)}
            disabled={!count}
            value={Math.max(1, Math.min(bar, count))}
            style={{
              background: `linear-gradient(to right,#41349d ${(Math.min(bar, count) / Math.max(1, count)) * 100}%,#36353f 0)`,
            }}
            aria-label="Replay position"
            onChange={(e) => {
              setBar(Number(e.target.value));
              setPlaying(false);
            }}
          />
          <div className="design-replay-time">
            <small>
              {p.selectedRun && bars[0]
                ? tradeDate(bars[0].time)
                : p.selectedRun
                  ? ""
                  : "04 Mar 00:00"}
            </small>
            <small>
              {Math.min(bar, count)} / {count} bars
            </small>
          </div>
        </DesignCard>
        <DesignCard className="design-trade-detail raised">
          <motion.h2 key={index} initial={reduced?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.18}}>Selected trade · #{p.selectedRun ? index + 1 : 24 + index}</motion.h2>
          <p>
            {trade
              ? new Date(trade.entryTime * 1000).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: getDisplayTimezone(),
                })
              : "No trades"}{" "}
            · {trade?.side === -1 ? "Short" : "Long"}
          </p>
          <dl>
            {[
              ["Entry", trade ? formatTradePrice(trade.entry) : "—"],
              ["Exit", trade ? formatTradePrice(trade.exit) : "—"],
              [
                "Stop loss",
                p.selectedRun ? (stopLoss ? formatTradePrice(stopLoss) : "—") : "$80,800",
              ],
              [
                "Take profit",
                p.selectedRun
                  ? takeProfit
                    ? formatTradePrice(takeProfit)
                    : "—"
                  : "$85,696",
              ],
              [
                "Net P/L",
                trade
                  ? (trade.pnl >= 0 ? "+" : "−") + money(Math.abs(trade.pnl),2)
                  : "—",
              ],
              [
                "Result",
                rMultiple != null
                  ? `${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(1)}R`
                  : "—",
              ],
              ["Exit reason", trade?.reason || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd
                  className={
                    ["Net P/L", "Result"].includes(label)
                      ? (trade?.pnl || 0) >= 0
                        ? "mint"
                        : "rose"
                      : ""
                  }
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {p.selectedRun&&trade&&!rules&&<p className="design-trade-risk-note">{trade.stopLoss===undefined&&trade.takeProfit===undefined?'SL/TP levels were not stored for this older run.':'SL/TP show the levels active at exit.'}</p>}
          <div className="design-trade-actions">
            <button
              className="design-button"
              disabled={!trades.length || index === 0}
              onClick={() => select(index - 1)}
            >
              Previous trade
            </button>
            <button
              className="design-button"
              disabled={!trades.length || index >= trades.length - 1}
              onClick={() => select(index + 1)}
            >
              Next trade
            </button>
          </div>
        </DesignCard>
      </div>
      <DesignCard className="design-trade-history">
        <header>
          <div>
            <h2>Trade history</h2>
            <p>
              {trades.length} trades · Trade #
              {p.selectedRun ? index + 1 : 24 + index} selected
            </p>
          </div>
          <div className="design-trade-filters"><AnimatedSelect aria-label="Trade direction" value={direction} onChange={e=>{setDirection(e.target.value);setTablePage(0);}}><option value="">All directions</option><option value="1">Long</option><option value="-1">Short</option></AnimatedSelect><AnimatedSelect aria-label="Exit reason" value={reason} onChange={e=>{setReason(e.target.value);setTablePage(0);}}><option value="">All exit reasons</option>{[...new Set(trades.map(t=>t.reason))].map(reason=><option key={reason}>{reason}</option>)}</AnimatedSelect><button className="design-button" onClick={exportTrades}>Export trades</button></div>
        </header>
        <div className="design-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Entry time",
                  "Side",
                  "Entry",
                  "Exit",
                  "Net P/L",
                  "R multiple",
                  "Exit reason",
                  "",
                ].map((t, i) => (
                  <th key={i}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(tablePage*25,tablePage*25+25).map(({trade:t,index:i}) => (
                <tr key={i} aria-selected={index === i}>
                  <td>{tradeDate(t.entryTime)}</td>
                  <td>{t.side === 1 ? "Long" : "Short"}</td>
                  <td>{formatTradePrice(t.entry)}</td>
                  <td>{formatTradePrice(t.exit)}</td>
                  <td className={t.pnl >= 0 ? "mint" : "rose"}>
                    {t.pnl >= 0 ? "+" : "−"}
                    {money(Math.abs(t.pnl),2)}
                  </td>
                  <td className={t.pnl >= 0 ? "mint" : "rose"}>
                    {p.selectedRun
                      ? tradeR(p.selectedRun, t) == null
                        ? "—"
                        : `${tradeR(p.selectedRun, t)! >= 0 ? "+" : ""}${tradeR(p.selectedRun, t)!.toFixed(1)}R`
                      : `${t.returnPct >= 0 ? "+" : ""}${t.returnPct.toFixed(1)}R`}
                  </td>
                  <td>{t.reason}</td>
                  <td>
                    <button
                      className="design-chart-link"
                      aria-label={`View trade ${i+1}`}
                      onClick={() => select(i)}
                    >
                      View on chart ↗
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length&&<p>No trades match these filters.</p>}
        <div className="design-trade-pagination"><span>{filtered.length?`${tablePage*25+1}–${Math.min((tablePage+1)*25,filtered.length)} of ${filtered.length} trades`:'0 trades'}</span><button className="design-button secondary" disabled={!tablePage} onClick={()=>setTablePage(n=>n-1)}>Previous</button><button className="design-button secondary" disabled={(tablePage+1)*25>=filtered.length} onClick={()=>setTablePage(n=>n+1)}>Next</button></div>
      </DesignCard>
      <p className="design-bottom-note">
        {p.selectedRun
          ? `Saved candles · Times shown in ${getDisplayTimezone()}`
          : "Layout preview · All controls and trade selection are interactive"}
      </p>
    </>
  );
}
export default function PenpotWorkspace(p: Props) {
  const {scope,reduced}=useWorkspaceMotion(p.page);
  const assistant = useAssistantContext();
  const [navOpen, setNavOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [symbolSearch, setSymbolSearch] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!p.running) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed((Date.now() - start) / 1000),
      1000,
    );
    return () => clearInterval(timer);
  }, [p.running]);
  const settingsDialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!settings) return;
    const before = document.activeElement as HTMLElement;
    const dialog = settingsDialog.current;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const nodes = dialog?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),a[href],input",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      before?.focus();
    };
  }, [settings]);
  const latestRun=p.runs[0];
  const run = p.page==='overview' ? latestRun : p.selectedRun || latestRun;
  const portfolio=p.portfolio;
  const portfolioSeries=useMemo(()=>portfolio.runCount?{id:'saved-run-portfolio',settings:{capital:portfolio.capital},curve:portfolio.curve}:undefined,[portfolio]);
  const performance=p.page==='overview'?portfolioSeries:run;
  const sharpe=performance?dailySharpeEstimate(performance.curve):null;
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        assistant.setOpen(false);
        setSettings(false);
        setNavOpen(false);
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  const active =
    p.page === "manual" || p.page === "runsettings" || p.page === "trades" || p.page === "results"
      ? "backtests"
      : p.page === "studio" ? "strategies" : p.page;
  const title =
    p.page === "overview"
      ? `Hello, ${p.userName}!`
      : p.page === "manual" ? "Manual replay" : p.page === "connections" ? "Connections" : p.page === "studio" ? "Strategy creation" : p.page === "strategies"
        ? "Strategies"
        : p.page === "runsettings"
          ? "Run backtest"
          : p.page === "trades"
            ? "Trades & chart"
            : "Backtests";
  const subtitle =
    p.page === "overview"
      ? "Turn an idea into something big."
      : p.page === "studio" ? "Write your rules or build a draft with AI." : p.page === "strategies"
        ? "Turn an idea into something big."
        : p.page === "runsettings"
          ? "Configure instruments, test periods and execution assumptions."
          : p.page === "trades"
            ? run
              ? run.strategyName + " · " + run.name
              : "Review the trades from your saved backtest."
            : run ? run.strategyName + ' · ' + run.symbol + ' · ' + timeframe(run.granularity || 3600) : "Test a strategy. Review every result.";
  const nav = (page: WorkspacePage) => {
    p.navigate(page);
    setNavOpen(false);
  };
  const marketList = [
    ...new Set([
      ...p.markets,
      ...p.options.markets,
      "BTC-USD",
      "ETH-USD",
      "SOL-USD",
    ]),
  ].filter((s) => s.toLowerCase().includes(symbolSearch.toLowerCase()));
  function metrics() {
    const combined=p.page==='overview';
    const returnPct=combined?portfolio.returnPct:run?.metrics.netReturnPct??0;
    const drawdownPct=combined?portfolio.maxDrawdownPct:run?.metrics.maxDrawdownPct??0;
    let drawdown=portfolio.maxDrawdown;
    if(!combined&&run){let peak=run.settings.capital;drawdown=0;for(const point of run.curve){peak=Math.max(peak,point.equity);drawdown=Math.max(drawdown,peak-point.equity);}}
    const profit=combined?portfolio.netProfit:run?run.settings.capital*returnPct/100:0;
    return <div className="design-metrics">
      <MetricCard label={combined?'Net profit':'Balance'} value={performance?money(combined?profit:(run?.settings.capital??0)+profit):'—'} percent={performance?percentage(returnPct):'No saved run'} hint={performance?combined?`Combined · ${portfolio.runCount} saved ${portfolio.runCount===1?'run':'runs'}`:run?.id===latestRun?.id?'Latest completed run':'Selected saved run':'Run your first backtest'} negative={!!performance&&profit<0} icon={combined?designIcons.profit:designIcons.balance}/>
      <MetricCard label="Sharpe ratio" value={sharpe?.value?.toFixed(2)??'—'} percent={!performance?'No saved run':sharpe?.value==null?'Need more data':sharpe.value>=0?'Positive':'Negative'} negative={sharpe?.value!=null&&sharpe.value<0} hint={!performance?'Run your first backtest':sharpe?.value==null?sharpe?.reason||'Daily equity estimate':sharpe.shortSample?`Estimate · ${sharpe.count} daily returns`:'Annualized · daily equity'} icon={designIcons.sharpe}/>
      <MetricCard label="Max drawdown" value={performance?'−'+money(drawdown):'—'} percent={performance?'−'+drawdownPct.toFixed(2)+'%':'No saved run'} hint={performance?combined?'Combined portfolio · peak to trough':'Peak to trough':'Run your first backtest'} negative={!!performance&&drawdownPct>0} icon={designIcons.drawdown}/>
    </div>;
  }
  return (
    <div className="penpot-workspace">
      <button
        className="design-mobile-menu design-icon-button"
        aria-label="Open navigation"
        onClick={() => setNavOpen((v) => !v)}
      >
        <Menu size={20} />
      </button>
      <WorkspaceSidebar active={active} nav={nav} navOpen={navOpen} setNavOpen={setNavOpen} accountControls={p.accountControls}/>
      <main ref={scope} className="design-main" data-motion-page={p.page} aria-busy={p.loading}>
        <WorkspaceTopbar {...p.search}/>
        <div className={"design-page-heading" + (p.page === "studio" ? " design-studio-heading" : "")}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {p.page==='backtests'&&run&&<div className="design-result-context"><span>{run.id===latestRun?.id?'Latest run':'Saved run'} · {run.name}</span>{run.id!==latestRun?.id&&latestRun&&<button className="design-button secondary" onClick={()=>nav('backtests')}>Latest: {latestRun.name}</button>}</div>}
          {p.page === "runsettings" && <button className="design-button" aria-label="Start backtest" disabled={p.running || !p.options.strategyId || !p.options.markets.length} onClick={p.onRun}>{p.running ? <RunStatusBadge state="processing"/> : "Run backtest"}</button>}
          {p.page === "studio" && <button className="design-button" onClick={p.onCreate}>New strategy</button>}
        </div>
        {['runsettings','trades'].includes(p.page)&&<div className="design-history-link"><button className="design-button secondary" onClick={()=>nav('history')}><History size={16}/>Saved backtests</button></div>}
        {p.error && (
          <p className="design-error" role="alert">
            {p.error}
          </p>
        )}
        {p.notice && (
          <p role="status" className="design-notice">
            {p.notice}
          </p>
        )}
        {p.page !== 'strategies' && p.loading && <DesignCard role="status"><p>Loading your saved workspace…</p></DesignCard>}
        {p.page !== 'strategies' && p.loadError && <DesignCard role="alert" className="design-library-empty"><h2>Could not load your workspace</h2><p>{p.loadError}</p><button className="design-button" onClick={()=>void p.onRetry()}>Try again</button></DesignCard>}
        {["connections","manual"].includes(p.page) && p.content}
        {p.page === "studio" && p.studio}
        {p.running && (
          <DesignCard className="design-progress">
            <h2>Running backtest</h2>
            <div
              role="progressbar"
              aria-label="Backtest processing"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p.progress}
            >
              <span style={{ width: p.progress + "%" }} />
            </div>
            <p>{p.progressText}</p>
            {p.progress > 0 && elapsed > 0 && (
              <p role="status">
                ~
                {Math.max(
                  1,
                  Math.round((elapsed * (100 - p.progress)) / p.progress),
                )}
                s remaining · estimate
              </p>
            )}
            <button className="design-button secondary" onClick={p.onCancel}>
              Cancel backtest
            </button>
          </DesignCard>
        )}
        {p.page === "overview" && !p.loading && !p.loadError && (
          <div className="design-dashboard-grid dashboard-unified">
            {metrics()}
            <div className="dashboard-chart-row">
              <DesignEquity run={portfolioSeries}/>
              <DesignCard className="design-latest raised">
                <CardTitle icon={designIcons.latest}>Latest backtest</CardTitle>
                <div
                  className={
                    "design-final-balance " +
                    (run && run.metrics.netReturnPct < 0
                      ? "loss-glow"
                      : "profit-glow")
                  }
                >
                  <div>
                    <strong>
                      {run
                        ? money(
                            run.settings.capital *
                              (1 + run.metrics.netReturnPct / 100),
                          )
                        : "—"}
                    </strong>
                    <small>Final balance</small>
                  </div>
                  <small>
                    {run ? percentage(run.metrics.netReturnPct) : "No saved run"}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Market</dt>
                    <dd>
                      {run ? `${run.symbol} · ${timeframe(run.granularity || 3600)}` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Strategy</dt>
                    <dd>{run?.strategyName || "—"}</dd>
                  </div>
                </dl>
                <motion.button whileTap={reduced?undefined:{scale:.985}} transition={{duration:.12}}
                  className="design-button"
                  onClick={() => nav(run ? "backtests" : "runsettings")}
                >
                  {run ? "View backtest" : "Set up a backtest"}
                </motion.button>
              </DesignCard>
            </div>
            <p className="design-portfolio-caption">{portfolio.runCount?`Backtest portfolio · ${portfolio.runCount} saved ${portfolio.runCount===1?'run':'runs'} · ${money(portfolio.capital)} combined starting capital`:"Your saved backtests will combine here."}{portfolio.excludedCount>0&&` · ${portfolio.excludedCount} without equity data excluded`}{portfolio.summaryCount>0&&` · ${portfolio.summaryCount} use daily summaries; intraday drawdown is estimated`}</p>
              <div className="design-dashboard-bottom">
                <DesignMonthly run={portfolioSeries} />
                <DesignCard className="design-continue">
                  <CardTitle icon={designIcons.edit}>
                    Continue working
                  </CardTitle>
                  <div className="design-continue-content"><div><h2>{p.strategies[0]?.name || "Create your first strategy"}</h2>
                  <p>{p.strategies[0]?`Saved version ${p.strategies[0].revision??1} · Ready to edit` : "Describe your idea, save the rules and run a backtest."}</p></div>
                  <button
                    className="design-button"
                    onClick={() =>
                      p.strategies[0]
                        ? p.onOpen(p.strategies[0].id)
                        : p.onCreate()
                    }
                  >
                    {p.strategies[0] ? "Open" : "Create strategy"}
                  </button></div>
                </DesignCard>
              </div>
          </div>
        )}
        {p.page === "strategies" && (
          <div className="design-dashboard-grid design-strategies-unified">
            <div className="design-side-column">
              <DesignCard className="design-utilities raised">
                <CardTitle icon={designIcons.layers}>Your library</CardTitle>
                <div className="design-library-count">
                  <strong>{p.strategies.length}</strong>
                  <span>{p.strategies.length === 1 ? "saved strategy" : "saved strategies"}</span>
                </div>
                <div className="design-library-actions">
                  <button className="design-button secondary" onClick={p.onCreate}>
                    Create strategy
                  </button>
                <button
                  className="design-button"
                  onClick={() => upload.current?.click()}
                >
                  Import strategy
                </button>
                </div>
                <input
                  hidden
                  ref={upload}
                  type="file"
                  aria-label="Import strategy JSON file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void p.onImport(file).catch(() => {});
                    e.target.value = "";
                  }}
                />
              </DesignCard>
            </div>
            {p.loading ? (
              <DesignCard>
                <p role="status">Loading your strategies…</p>
              </DesignCard>
            ) : p.loadError ? (
              <DesignCard>
                <p role="alert">{p.loadError}</p>
                <button
                  className="design-button"
                  onClick={() => void p.onRetry()}
                >
                  Try again
                </button>
              </DesignCard>
            ) : (
              <Library p={p} search={p.librarySearch} setSearch={p.onLibrarySearch} />
            )}
          </div>
        )}
        {p.page === "backtests" && !p.loading && !p.loadError && (
          <div className="design-backtest-overview">
            <div className="design-overview-action"><p>{run&&run.id===latestRun?.id?'Your latest completed backtest.':'Review a saved result or configure your next test.'}</p><div className="design-overview-actions"><button className="design-button secondary" onClick={()=>nav('history')}><History size={16}/>Saved backtests</button><button className="design-button" aria-label="Configure backtest" onClick={()=>nav('runsettings')}>Run backtest</button></div></div>
            <div className="design-right-column">
              {metrics()}
              <DesignEquity run={run} />
              <DesignCard className="design-trades-summary">
                <CardTitle icon={designIcons.trades}>Trades</CardTitle>
                <h2>
                  {run ? `${run.metrics.tradeCount} trades · ${run.metrics.winRatePct.toFixed(2)}% win rate` : "No trades yet"}
                </h2>
                <p>
                  {run ? `${run.symbol} · ${timeframe(run.granularity || 3600)} · ${run.strategyName}` : "Your trades will appear after your first completed backtest."}
                </p>
                <motion.button whileTap={reduced?undefined:{scale:.985}} transition={{duration:.12}} className="design-button" disabled={!run} onClick={() => nav("trades")}>
                  View trades
                </motion.button>
              </DesignCard>
              {p.resultDetails}
            </div>
          </div>
        )}
        {p.page === "runsettings" && (
          <>
            {!p.loading && !p.loadError && !p.strategies.length && <DesignCard className="design-library-empty"><h2>Start with a strategy</h2><p>Create and save your trading rules first, then choose your market and test period below.</p><button className="design-button" onClick={p.onCreate}>Create strategy</button></DesignCard>}
            <div className="design-settings-grid">
              <DesignCard>
                <h2>Run &amp; instruments</h2>
                <Field label="Run name">
                  <input
                    aria-label="Run name"
                    value={p.options.name}
                    onChange={(e) => p.update("name", e.target.value)}
                  />
                </Field>
                <div className="design-markets-label">
                  <h3>Markets</h3>
                  <small>{p.options.markets.length} selected</small>
                </div>
                <div className="design-market-actions">
                  <button
                    className="design-button secondary"
                    onClick={() => p.update("markets", marketList)}
                  >
                    Check all
                  </button>
                  <button
                    className="design-button secondary"
                    onClick={() => p.update("markets", [])}
                  >
                    Uncheck all
                  </button>
                </div>
                <Field label="Search instruments">
                  <input
                    type="search"
                    placeholder="Search symbols..."
                    aria-label="Search symbols"
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                  />
                </Field>
                <div className="design-market-list">
                  {marketList.map((s) => (
                    <label key={s}>
                      <input
                        type="checkbox"
                        checked={p.options.markets.includes(s)}
                        onChange={(e) =>
                          p.update(
                            "markets",
                            e.target.checked
                              ? [...p.options.markets, s]
                              : p.options.markets.filter((v) => v !== s),
                          )
                        }
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </DesignCard>
              <DesignCard>
                <h2>Strategy &amp; test period</h2>
                <SettingsFields p={p} advanced />
              </DesignCard>
              <DesignCard>
                <h2>Capital &amp; execution</h2>
                <Field label="Starting capital">
                  <input
                    type="number"
                    min="1"
                    aria-label="Starting capital"
                    value={p.options.capital}
                    onChange={(e) =>
                      p.update("capital", Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Risk per trade · % of equity"><input type="number" aria-label="Risk per trade percent" min="0" max="10" step=".1" value={p.options.riskPct} onChange={e=>p.update('riskPct',Number(e.target.value))}/></Field><p className="design-help">0 uses the strategy's allocation. A risk override requires a stop loss and is capped at available equity.</p><Field label="Spread · basis points"><input type="number" aria-label="Spread (basis points)" min="0" max="1000" step=".1" value={p.options.spreadBps} onChange={e=>p.update('spreadBps',Number(e.target.value))}/></Field>
                <Field label="Commission mode"><AnimatedSelect aria-label="Commission mode" value={p.options.feeMode} onChange={e=>p.update('feeMode',e.target.value)}><option value="percentage">Percentage per side</option><option value="fixed">Fixed per trade</option></AnimatedSelect></Field>
                {p.options.feeMode==='fixed'&&<Field label="Fee per trade"><input type="number" aria-label="Fee per trade" min="0" step=".1" value={p.options.feePerTrade} onChange={e=>p.update('feePerTrade',Number(e.target.value))}/></Field>}
                <div className="design-fees">
                  <Field label="Fee · basis points">
                    <input
                      type="number"
                      min="0"
                      step=".1"
                      aria-label="Fee (basis points)"
                      disabled={p.options.feeMode === "fixed"}
                      value={p.options.feeBps}
                      onChange={(e) =>
                        p.update("feeBps", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Slippage · basis points">
                    <input
                      type="number"
                      min="0"
                      step=".1"
                      aria-label="Slippage (basis points)"
                      value={p.options.slippageBps}
                      onChange={(e) =>
                        p.update("slippageBps", Number(e.target.value))
                      }
                    />
                  </Field>
                </div>
                <p className="design-help">
                  Spot candles do not include bid/ask spread.
                  <br />
                  Entered spread, fees and slippage model trading costs. {p.options.feeMode === "fixed" && `Fixed commission: ${money(p.options.feePerTrade || 0)} per trade.`}
                </p>
                <p className="design-help">
                  Tester options are saved in this browser.
                </p>
                <div className="design-run-summary">
                  <h2>Run summary</h2>
                  <p>
                    {p.options.markets.length} markets ·{" "}
                    {timeframe(p.options.granularity)} ·{" "}
                    {p.strategies.find((s) => s.id === p.options.strategyId)
                      ?.name || "Select a saved strategy"}
                  </p>
                  <p>
                    Development {p.options.splitPct}% · Validation{" "}
                    {100 - p.options.splitPct}%
                  </p>
                  <p>
                    Starting capital {money(p.options.capital)} · Fee{" "}
                    {p.options.feeMode === "fixed" ? `${money(p.options.feePerTrade || 0)} per trade` : `${p.options.feeBps} bps`}
                  </p>
                  <p>Slippage {p.options.slippageBps} bp</p>
                </div>
              </DesignCard>
            </div>
            {p.researchTools}
            {p.batchTools}
            <RunDefaultsPanel apiFetch={p.apiFetch} current={{capital:p.options.capital,feeMode:p.options.feeMode,feePerTrade:p.options.feePerTrade,riskPct:p.options.riskPct,spreadBps:p.options.spreadBps,feeBps:p.options.feeBps,slippageBps:p.options.slippageBps,splitPct:p.options.splitPct}} onApply={defaults=>{p.update('feeMode',defaults.feeMode??'percentage');p.update('feePerTrade',defaults.feePerTrade??1);p.update('capital',defaults.capital);p.update('riskPct',defaults.riskPct??0);p.update('spreadBps',defaults.spreadBps??0);p.update('feeBps',defaults.feeBps);p.update('slippageBps',defaults.slippageBps);p.update('splitPct',defaults.splitPct);}}/>
            <div className="design-settings-footer">
              <small>
                {p.options.markets.length} instruments selected · Options saved
                in this browser
              </small>
              <button
                className="design-button secondary"
                onClick={() => nav("backtests")}
              >
                Overview
              </button>

            </div>
          </>
        )}
        {p.page === "trades" && !p.loading && !p.loadError && (run ? <Replay p={{...p,selectedRun:run}} /> : <DesignCard className="design-library-empty"><DesignIcon icon={designIcons.trades}/><h2>No trades to review yet</h2><p>Complete a backtest, then explore its entries, exits and price chart here.</p><button className="design-button" onClick={()=>nav("runsettings")}>Set up a backtest</button></DesignCard>)}
        {p.page === "studio" && p.researchTools}
      </main>
      {settings && (
        <div
          className="design-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettings(false);
          }}
        >
          <DesignCard className="design-settings-dialog">
            <div
              ref={settingsDialog}
              role="dialog"
              aria-modal="true"
              aria-label="Workspace settings"
            >
              <button
                className="design-icon-button"
                aria-label="Close settings"
                onClick={() => setSettings(false)}
              >
                <X size={18} />
              </button>
              <h2>Workspace settings</h2><button className="design-button secondary" onClick={() => {setSettings(false);nav("connections");}}>Connections</button>
              <p>Your strategies and results are saved in this browser.</p>
              <button
                className="design-button"
                onClick={() => void p.onBackup()}
              >
                Export backup
              </button>
              <button
                className="design-button secondary"
                onClick={() => setSettings(false)}
              >
                Close
              </button>
            </div>
          </DesignCard>
        </div>
      )}
    </div>
  );
}
