import type { ApiFetch } from "./api-client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChartNoAxesCombined,
  ChevronLeft,
  Database,
  House,
  Layers,
  Menu,
  Search,
  Send,
  Square,
  X,
} from "lucide-react";
import { generateStrategy } from "./gemini";
import {
  CardTitle,
  DesignCard,
  DesignEquity,
  DesignIcon,
  DesignMonthly,
  MetricCard,
  StrategyExample,
  designIcons,
} from "./PenpotPrimitives";
import { latestStrategyRuns } from "./strategyLibrary";
import { savedRules, tradeR, tradesCsv } from "./results";
import { replayPreview } from "./penpotReplayPreview";
import ConfirmStrategyDelete from "./ConfirmStrategyDelete";
import type { WorkspacePage } from "./WorkspaceShell";
import RunStatusBadge, { type RunState } from "./RunStatusBadge";
import useWorkspaceMotion from './useWorkspaceMotion';
import {motion,useReducedMotion} from 'motion/react';
import type { Bar, Dataset, Run, SavedStrategy, Trade } from "./types";

export type RunOptions = {
  strategyId: string;
  markets: string[];
  granularity: number;
  capital: number;
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
  apiFetch: ApiFetch; accountControls?: ReactNode; researchTools?: ReactNode; content?: ReactNode;
  studio?: ReactNode;
  loading: boolean;
  loadError: string;
  onRetry: () => Promise<void>;
  datasets: Dataset[];
  page: WorkspacePage;
  navigate: (page: WorkspacePage) => void;
  strategies: SavedStrategy[];
  runs: Run[];
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
    timeZone: "UTC",
  });
const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const percentage = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="design-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Assistant({
  onDraft,
  apiFetch,
  floating = false,
  onClose,
}: {
  onDraft: (source: string) => void;
  apiFetch: ApiFetch;
  floating?: boolean;
  onClose?: () => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [reply, setReply] = useState(""),
    [error, setError] = useState(""),
    [draft, setDraft] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(
    null,
  );
  async function send() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await generateStrategy(prompt, apiFetch);
      setDraft(JSON.stringify(result.strategy, null, 2));
      setReply(result.strategy.description || result.strategy.name);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The assistant is unavailable. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <DesignCard className={"design-assistant " + (floating ? "floating" : "")}>
      <div
        className="assistant-drag"
        style={
          floating
            ? { transform: `translate(${position.x}px,${position.y}px)` }
            : undefined
        }
      />
      <header
        onPointerDown={(e) => {
          if (
            !floating ||
            (e.target instanceof Element && e.target.closest("button"))
          )
            return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            dx: position.x,
            dy: position.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const d = drag.current;
            const x = Math.max(
                -70,
                Math.min(innerWidth - 380, d.dx + e.clientX - d.x),
              ),
              y = Math.max(
                -innerHeight / 2,
                Math.min(50, d.dy + e.clientY - d.y),
              );
            setPosition({ x, y });
            const card = e.currentTarget.parentElement!;
            card.style.transform = `translate(${x}px,${y}px)`;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <CardTitle icon={designIcons.assistant}>AI assistant</CardTitle>
        {floating && (
          <button
            className="design-icon-button"
            aria-label="Close assistant"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        )}
      </header>
      {!reply ? (
        <>
          <h2>
            What can I<br />
            help you with?
          </h2>
          <div className="assistant-suggestions">
            {["Review my strategy", "Explain drawdown"].map((text) => (
              <button key={text} onClick={() => setPrompt(text)}>
                {text}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="assistant-response">
          <p>{reply}</p>
          <button className="design-button" onClick={() => onDraft(draft)}>
            Open draft
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="design-error">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          aria-label="Ask the AI assistant"
          placeholder="Ask anything..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          aria-label={busy ? "Generating strategy" : "Send to assistant"}
          disabled={busy}
        >
          <Send size={18} fill="currentColor" />
        </button>
      </form>
    </DesignCard>
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
    : [{ id: "", name: "BTC trend crossover" }];
  const update = (key: keyof RunOptions, value: string | number | string[]) =>
    p.update(key, value);
  return (
    <>
      {!!p.datasets.length && (
        <Field label="Market / dataset">
          <select
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
          </select>
        </Field>
      )}
      <Field label="Strategy">
        <select
          aria-label="Strategy"
          value={o.strategyId}
          onChange={(e) => update("strategyId", e.target.value)}
        >
          {strategyOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={advanced ? "Timeframe" : "Market"}>
        {advanced ? (
          <select
            aria-label="Timeframe"
            value={o.granularity}
            onChange={(e) => update("granularity", Number(e.target.value))}
          >
            {[
              [60, "1 minute"],
              [300, "5 minutes"],
              [900, "15 minutes"],
              [3600, "1 hour"],
              [21600, "6 hours"],
              [86400, "1 day"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <select
            aria-label="Market"
            value={o.markets[0] || "BTC-USD"}
            onChange={(e) => update("markets", [e.target.value])}
          >
            {[...new Set(["BTC-USD", ...p.markets])].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
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
            <select
              aria-label="Timeframe"
              value={o.granularity}
              onChange={(e) => update("granularity", Number(e.target.value))}
            >
              {[
                [60, "1 minute"],
                [300, "5 minutes"],
                [900, "15 minutes"],
                [3600, "1 hour"],
                [21600, "6 hours"],
                [86400, "1 day"],
              ].map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
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
function Library({ p }: { p: Props }) {
  const [search, setSearch] = useState(""),
    [market, setMarket] = useState(""),
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
  const examples = [
    ["BTC trend crossover", "BTC-USD · 1h", "+24.80%", "1.55", "84"],
    ["ETH breakout", "ETH-USD · 4h", "+12.20%", "1.42", "62"],
    ["Mean reversion", "BTC-USD · 15m", "-3.20%", "0.91", "124"],
    ["Momentum filter", "SOL-USD · 1h", "-8.40%", "0.63", "48"],
  ];
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
        <select
          aria-label="Filter strategies by market"
          value={market}
          onChange={(e) => setMarket(e.target.value)}
        >
          <option value="">All markets</option>
          {[...new Set(p.runs.map((r) => r.symbol))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Sort strategies"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Recently updated</option>
          <option value="name">Name</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="design-error">
          {error}
        </p>
      )}
      <div className="design-strategy-grid">
        {!p.strategies.length
          ? examples
              .filter((s) => s[0].toLowerCase().includes(search.toLowerCase()))
              .map(([name, m, result, factor, trades]) => (
                <StrategyExample
                  key={name}
                  name={name}
                  market={m}
                  result={result}
                  factor={factor}
                  trades={trades}
                  negative={result.startsWith("-")}
                  onOpen={p.onCreate}
                />
              ))
          : list.map((s) => {
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
                              p.navigate("backtests");
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
            onClick={() => p.navigate("backtests")}
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
const sampleTrades: Trade[] = [
  {
    entryTime: 1772614800,
    exitTime: 1772701200,
    side: 1,
    entry: 82400,
    exit: 85696,
    pnl: 180,
    returnPct: 1.8,
    reason: "Take profit",
  },
  {
    entryTime: 1772715600,
    exitTime: 1772726400,
    side: 1,
    entry: 86020,
    exit: 84300,
    pnl: -100,
    returnPct: -1,
    reason: "Stop loss",
  },
  {
    entryTime: 1772791200,
    exitTime: 1772802000,
    side: 1,
    entry: 85210,
    exit: 87390,
    pnl: 120,
    returnPct: 1.2,
    reason: "Signal",
  },
];
function Replay({ p }: { p: Props }) {
  const reduced=useReducedMotion();
  const trades = p.selectedRun?.trades || sampleTrades;
  const [index, setIndex] = useState(0),
    [bar, setBar] = useState(37),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [bars, setBars] = useState<Bar[]>([]),
    [loadError, setLoadError] = useState("");
  const trade = trades[Math.min(index, trades.length - 1)];
  useEffect(() => {
    if (!p.selectedRun || !trade) return;
    const abort = new AbortController();
    setLoadError("");
    setBars([]);
    p.loadBars(p.selectedRun, trade, abort.signal)
      .then(setBars)
      .catch((e) => {
        if (!abort.signal.aborted) setLoadError(String(e));
      });
    return () => abort.abort();
  }, [p.selectedRun?.id, trade]);
  const count = p.selectedRun ? bars.length : 44;
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
    setBar(p.selectedRun ? 1 : 37);
    setPlaying(false);
  }, [p.selectedRun?.id]);
  const candles = p.selectedRun ? bars : replayPreview;
  const startIndex = Math.max(0, Math.min(bar, candles.length) - 80);
  const visibleCandles = candles.slice(
    startIndex,
    Math.min(bar, candles.length),
  );
  const rules = p.selectedRun ? savedRules(p.selectedRun) : null;
  const stopLoss =
    trade && rules?.stopLossPct
      ? trade.entry * (1 - (trade.side * rules.stopLossPct) / 100)
      : undefined;
  const takeProfit =
    trade && rules?.takeProfitPct
      ? trade.entry * (1 + (trade.side * rules.takeProfitPct) / 100)
      : undefined;
  const extrema = candles.reduce(
    (range, candle) => ({
      min: Math.min(range.min, candle.low),
      max: Math.max(range.max, candle.high),
    }),
    { min: Infinity, max: -Infinity },
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
                      ? setPlaying((v) => !v)
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
                    ? (high - (i * (high - low)) / 4).toLocaleString("en-US", {
                        maximumFractionDigits: high < 10 ? 4 : 0,
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
                  timeZone: "UTC",
                })
              : "No trades"}{" "}
            · {trade?.side === -1 ? "Short" : "Long"}
          </p>
          <dl>
            {[
              ["Entry", trade ? money(trade.entry) : "—"],
              ["Exit", trade ? money(trade.exit) : "—"],
              [
                "Stop loss",
                p.selectedRun ? (stopLoss ? money(stopLoss) : "—") : "$80,800",
              ],
              [
                "Take profit",
                p.selectedRun
                  ? takeProfit
                    ? money(takeProfit)
                    : "—"
                  : "$85,696",
              ],
              [
                "Net P/L",
                trade
                  ? (trade.pnl >= 0 ? "+" : "−") + money(Math.abs(trade.pnl))
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
          <button className="design-button" onClick={exportTrades}>
            Export trades
          </button>
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
              {trades.map((t, i) => (
                <tr key={i} aria-selected={index === i}>
                  <td>{tradeDate(t.entryTime)}</td>
                  <td>{t.side === 1 ? "Long" : "Short"}</td>
                  <td>{money(t.entry)}</td>
                  <td>{money(t.exit)}</td>
                  <td className={t.pnl >= 0 ? "mint" : "rose"}>
                    {t.pnl >= 0 ? "+" : "−"}
                    {money(Math.abs(t.pnl))}
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
      </DesignCard>
      <p className="design-bottom-note">
        {p.selectedRun
          ? "Saved candles · Times shown in UTC"
          : "Layout preview · All controls and trade selection are interactive"}
      </p>
    </>
  );
}
export default function PenpotWorkspace(p: Props) {
  const {scope,reduced}=useWorkspaceMotion(p.page);
  const [assistant, setAssistant] = useState(false),
    [navOpen, setNavOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [symbolSearch, setSymbolSearch] = useState(""),
    [workspaceSearch, setWorkspaceSearch] = useState("");
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
  const run = p.selectedRun || p.runs[0];
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAssistant(false);
        setSettings(false);
        setNavOpen(false);
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  const sample = !p.runs.length;
  const active =
    p.page === "runsettings" || p.page === "trades" || p.page === "results"
      ? "backtests"
      : p.page === "studio" ? "strategies" : p.page;
  const title =
    p.page === "overview"
      ? "Hello, Adam!"
      : p.page === "connections" ? "Connections" : p.page === "studio" ? "Strategy creation" : p.page === "strategies"
        ? "Strategies"
        : p.page === "runsettings"
          ? "Run settings"
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
              : "BTC trend crossover · Version 3 · Run #018"
            : "Test a strategy. Review every result.";
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
    return (
      <div className="design-metrics">
        <MetricCard
          label={p.page === "overview" ? "Net profit" : "Balance"}
          value={
            run
              ? money(
                  (p.page === "overview" ? 0 : run.settings.capital) +
                    (run.settings.capital * run.metrics.netReturnPct) / 100,
                )
              : p.page === "overview"
                ? "$42,480"
                : "$10,067"
          }
          percent={
            run
              ? percentage(run.metrics.netReturnPct)
              : p.page === "overview"
                ? "+8.4%"
                : "+0.67%"
          }
          hint={
            p.page === "overview" ? "Portfolio return" : "Latest completed run"
          }
          negative={!!run && run.metrics.netReturnPct < 0}
          icon={
            p.page === "overview" ? designIcons.profit : designIcons.balance
          }
        />
        <MetricCard
          label="Sharpe ratio"
          value={
            run
              ? run.metrics.sharpe?.toFixed(2) || "—"
              : p.page === "overview"
                ? "1.25"
                : "0.87"
          }
          percent={
            run
              ? run.metrics.sharpe === null
                ? "Unavailable"
                : run.metrics.sharpe >= 0
                  ? "Positive"
                  : "Negative"
              : "Positive"
          }
          negative={
            !!run && run.metrics.sharpe !== null && run.metrics.sharpe < 0
          }
          hint={
            p.page === "overview"
              ? run
                ? "Latest backtest sharpe"
                : "Portfolio sharpe"
              : "For this backtest"
          }
          icon={designIcons.sharpe}
        />
        <MetricCard
          label="Max drawdown"
          value={
            run
              ? "−" +
                money(
                  run.curve.reduce(
                    (s, point) => ({
                      peak: Math.max(s.peak, point.equity),
                      draw: Math.max(
                        s.draw,
                        Math.max(s.peak, point.equity) - point.equity,
                      ),
                    }),
                    { peak: run.settings.capital, draw: 0 },
                  ).draw,
                )
              : p.page === "overview"
                ? "-$31,430"
                : "$10,301"
          }
          percent={
            run ? "−" + run.metrics.maxDrawdownPct.toFixed(2) + "%" : "-6.2%"
          }
          hint={
            p.page === "overview"
              ? run
                ? "Latest backtest drawdown"
                : "Portfolio drawdown"
              : "Peak to trough"
          }
          negative
          icon={designIcons.drawdown}
        />
      </div>
    );
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
      <aside className={"design-sidebar " + (navOpen ? "open" : "")}>
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
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-current={p.page === id ? "page" : undefined}
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
            <hr />
            <button onClick={() => setSettings(true)}>
              <span className="design-icon">
                <img
                  src="/design/icon-settings.svg"
                  alt=""
                  width="15"
                  height="15"
                />
              </span>
              Settings
            </button>
            <button onClick={() => setSettings(true)}>
              <span className="design-icon">
                <img
                  src="/design/icon-help.svg"
                  alt=""
                  width="15"
                  height="15"
                />
              </span>
              Help center
            </button>
          </nav>
        </div>
        <div className="design-sidebar-bottom">
          <button
            className="design-ai-launcher"
            aria-label="Open AI assistant"
            onClick={() => setAssistant((v) => !v)}
          >
            <img src="/design/ai-wall.svg" alt="" />
          </button>
          {p.accountControls || <div className="design-user">
            <span>A</span>
            <div>
              Adam V.<small>adam.xxx@gmail.com</small>
            </div>
          </div>}
        </div>
      </aside>
      <main ref={scope} className="design-main" data-motion-page={p.page}>
        <header className="design-topbar">
          <DesignIcon icon={Layers} />
          <input
            type="search"
            aria-label="Search your workspace"
            placeholder="Search your workspace..."
            value={workspaceSearch}
            onChange={(e) => setWorkspaceSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && workspaceSearch.trim())
                nav("strategies");
            }}
          />
          <small>{sample ? "Preview data" : "Saved workspace"}</small>
          {!!p.runs.length && (
            <button
              className="design-history-link"
              onClick={() => nav("history")}
            >
              Saved backtests
            </button>
          )}
        </header>
        <div className={"design-page-heading" + (p.page === "studio" ? " design-studio-heading" : "")}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {p.page === "studio" && <button className="design-button" onClick={p.onCreate}>New strategy</button>}
        </div>
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
        {p.page === "connections" && p.content}
        {p.page === "studio" && p.studio}
        {["studio","runsettings"].includes(p.page) && p.page !== "studio" && p.researchTools}
        {p.page === "overview" && (
          <div className="design-dashboard-grid">
            <div className="design-side-column">
              <Assistant apiFetch={p.apiFetch} onDraft={p.onDraft} />
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
                        : "$12,480"}
                    </strong>
                    <small>Final balance</small>
                  </div>
                  <small>
                    {run ? percentage(run.metrics.netReturnPct) : "+8.4%"}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Market</dt>
                    <dd>
                      {run?.symbol || "BTC-USD"} ·{" "}
                      {timeframe(run?.granularity || 3600)}
                    </dd>
                  </div>
                  <div>
                    <dt>Strategy</dt>
                    <dd>{run?.strategyName || "Trend crossover"}</dd>
                  </div>
                </dl>
                <motion.button whileTap={reduced?undefined:{scale:.985}} transition={{duration:.12}}
                  className="design-button"
                  onClick={() => nav("backtests")}
                >
                  View backtest
                </motion.button>
              </DesignCard>
            </div>
            <div className="design-right-column">
              {metrics()}
              <DesignEquity run={run} />
              <div className="design-dashboard-bottom">
                <DesignMonthly run={run} />
                <DesignCard className="design-continue">
                  <CardTitle icon={designIcons.edit}>
                    Continue working
                  </CardTitle>
                  <h2>{p.strategies[0]?.name || "BTC trend crossover"}</h2>
                  <p>BTC-USD · 1h · Saved version 3</p>
                  <button
                    className="design-button"
                    onClick={() =>
                      p.strategies[0]
                        ? p.onOpen(p.strategies[0].id)
                        : p.onCreate()
                    }
                  >
                    Open
                  </button>
                </DesignCard>
              </div>
            </div>
          </div>
        )}
        {p.page === "strategies" && (
          <div className="design-dashboard-grid">
            <div className="design-side-column">
              <Assistant apiFetch={p.apiFetch} onDraft={p.onDraft} />
              <DesignCard className="design-utilities raised">
                <CardTitle icon={designIcons.layers}>Your library</CardTitle>
                <div className="design-library-count">
                  <strong>{p.strategies.length}</strong>
                  <span>saved strategies</span>
                  <button className="design-create-link" onClick={p.onCreate}>
                    Create strategy
                  </button>
                </div>
                <h2>Organize your ideas</h2>
                <p>
                  Keep the rules and test results
                  <br />
                  together for each strategy.
                </p>
                <button
                  className="design-button"
                  onClick={() => upload.current?.click()}
                >
                  Import strategy
                </button>
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
              <Library p={p} />
            )}
          </div>
        )}
        {p.page === "backtests" && (
          <div className="design-dashboard-grid">
            <DesignCard
              className={
                "design-run-simple raised " +
                (p.datasets.length ? "has-datasets" : "")
              }
            >
              <CardTitle icon={designIcons.run}>Run Backtest</CardTitle>
              <SettingsFields p={p} />
              <button
                className="design-button"
                onClick={p.onRun}
                disabled={p.running}
              >
                <RunStatusBadge state={p.runState} />
              </button>
              <button
                className="design-button secondary"
                onClick={() => nav("runsettings")}
              >
                Settings
              </button>
              <small>Advanced instruments &amp; execution</small>
            </DesignCard>
            <div className="design-right-column">
              {metrics()}
              <DesignEquity run={run} />
              <DesignCard className="design-trades-summary">
                <CardTitle icon={designIcons.trades}>Trades</CardTitle>
                <h2>
                  {run?.metrics.tradeCount ?? 3} trades ·{" "}
                  {run?.metrics.winRatePct?.toFixed(2) || "33.33"}% win rate
                </h2>
                <p>
                  {run?.symbol || "RNBW-USD"} ·{" "}
                  {timeframe(run?.granularity || 3600)} ·{" "}
                  {run?.strategyName || "SMA crossover"}
                </p>
                <motion.button whileTap={reduced?undefined:{scale:.985}} transition={{duration:.12}} className="design-button" onClick={() => nav("trades")}>
                  View trades
                </motion.button>
              </DesignCard>
            </div>
          </div>
        )}
        {p.page === "runsettings" && (
          <>
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
                  Fees and slippage model trading costs. {p.options.feeMode === "fixed" && `Fixed commission: ${money(p.options.feePerTrade || 0)} per trade, set in Research tools.`}
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
              <button
                className="design-button"
                disabled={p.running}
                onClick={p.onRun}
              >
                {p.runState === 'idle' ? <>Run {p.options.markets.length} backtests</> : <RunStatusBadge state={p.runState} />}
              </button>
            </div>
          </>
        )}
        {p.page === "trades" && <Replay p={p} />}
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
        {p.page === "studio" && p.researchTools}
      </main>
      {assistant && (
        <div
          className="design-floating-assistant"
          role="dialog"
          aria-label="AI assistant"
        >
          <Assistant apiFetch={p.apiFetch}
            floating
            onDraft={p.onDraft}
            onClose={() => setAssistant(false)}
          />
        </div>
      )}
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
