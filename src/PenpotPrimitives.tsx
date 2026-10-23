import { useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  FileChartColumn,
  Layers,
  Pencil,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Run } from "./types";
import ResponsiveEquity from "./ResponsiveEquity";
import AnimatedValue from './AnimatedValue';
import useCardTilt from './useCardTilt';
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import "./penpot.css";

export const designIcons = {
  profit: Wallet,
  sharpe: Scale,
  drawdown: ArrowDownRight,
  balance: ArrowUpRight,
  trades: ArrowLeftRight,
  run: SlidersHorizontal,
  latest: FileChartColumn,
  monthly: CalendarDays,
  edit: Pencil,
  chart: ChartNoAxesCombined,
  assistant: Sparkles,
  layers: Layers,
};
export function DesignIcon({
  icon: Icon,
  className = "",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  const key = Object.entries(designIcons).find(
    ([, value]) => value === Icon,
  )?.[0];
  const exact =
    key &&
    [
      "profit",
      "sharpe",
      "drawdown",
      "latest",
      "monthly",
      "edit",
      "assistant",
      "chart",
      "layers",
      "run",
      "balance",
      "trades",
    ].includes(key);
  return (
    <span className={"design-icon " + className} aria-hidden="true">
      {exact ? (
        <img
          width="15"
          height="15"
          src={"/design/icon-" + key + ".svg"}
          alt=""
        />
      ) : (
        <Icon size={15} strokeWidth={1.5} />
      )}
    </span>
  );
}
export function DesignCard({
  children,
  className = "",
  ...props
}: HTMLMotionProps<'section'>) {
  const tilt=useCardTilt(className.includes('floating'));
  return <motion.section {...props} {...tilt} className={"design-card " + className}>{children}</motion.section>;
}
export function CardTitle({
  children,
  icon,
}: {
  children: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="design-card-title">
      <DesignIcon icon={icon} />
      <span>{children}</span>
    </div>
  );
}
export function MetricCard({
  label,
  value,
  percent,
  hint,
  negative = false,
  icon,
}: {
  label: string;
  value: string;
  percent: string;
  hint: string;
  negative?: boolean;
  icon: LucideIcon;
}) {
  return (
    <DesignCard
      className={"design-metric " + (negative ? "loss-glow" : "profit-glow")}
    >
      <CardTitle icon={icon}>{label}</CardTitle>
      <div className="design-metric-value">
        <strong><AnimatedValue value={value} animate={label==='Net profit'||label==='Balance'}/></strong>
        <small>{percent}</small>
      </div>
      <p>{hint}</p>
    </DesignCard>
  );
}
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const sampleHeights = [0.253, 0.458, 0.687, 1, 0.675, 0.482, 0.723];
export function DesignMonthly({
  run,
  example = false,
  className = "",
}: {
  run?: Run;
  example?: boolean;
  className?: string;
}) {
  const [selected, setSelected] = useState(3);
  const reducedMotion = useReducedMotion();
  const history = new Map<
    string,
    { label: string; start: number; end: number }
  >();
  let previous = run?.settings.capital || 0;
  for (const point of run?.curve || []) {
    const date = new Date(point.time * 1000);
    const key = date.toISOString().slice(0, 7);
    const item = history.get(key);
    if (item) item.end = point.equity;
    else
      history.set(key, {
        label: months[date.getUTCMonth()],
        start: previous,
        end: point.equity,
      });
    previous = point.equity;
  }
  const returns = [...history.values()].slice(-7);
  const active = returns[Math.min(selected, returns.length - 1)];
  const max = Math.max(1, ...returns.map((r) => Math.abs(r.end - r.start)));
  const bars = run
    ? returns.map((r) => ({
        label: r.label,
        height: Math.abs(r.end - r.start) / max,
        negative: r.end < r.start,
      }))
    : example ? sampleHeights.map((height, index) => ({
        label: months[index],
        height,
        negative: false,
      })) : [];
  return (
    <DesignCard className={"design-monthly profit-glow " + className}>
      <div className="design-monthly-heading">
        <CardTitle icon={designIcons.monthly}>Monthly returns</CardTitle>
        <div>
          <strong>
            {run
              ? active
                ? (active.end - active.start < 0 ? "−" : "") +
                  "$" +
                  Math.abs(active.end - active.start).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })
                : "—"
              : example ? "$" + Math.round(564 * sampleHeights[selected]) : "—"}
          </strong>
          <small>
            {run
              ? active
                ? (active.end - active.start >= 0 ? "+" : "") +
                  ((active.end / active.start - 1) * 100).toFixed(1) +
                  "%"
                : "No curve data"
              : example ? "+" + (8.4 * sampleHeights[selected]).toFixed(1) + "%" : "No saved returns"}
          </small>
        </div>
      </div>
      {!bars.length && <div className="design-empty-chart"><CalendarDays size={26} strokeWidth={1.3}/><p>Your monthly returns will appear after your first backtest.</p></div>}
      {!!bars.length && <div className="design-monthly-bars">
        {bars.map(({ height, label, negative }, index) => (
          <button
            key={(run?.id || 'preview') + label + index}
            aria-label={label + " monthly return"}
            aria-pressed={Math.min(selected, bars.length - 1) === index}
            onClick={() => setSelected(index)}
            onPointerEnter={() => setSelected(index)}
            onFocus={() => setSelected(index)}
            className={negative ? "negative" : ""}
          >
            <motion.span style={{height:Math.max(3,height*100)+'%',transformOrigin:'50% 100%'}} initial={reducedMotion?false:{scaleY:0}} animate={{height:Math.max(3,height*100)+'%',...(reducedMotion?{scaleY:1}:{})}} whileInView={{scaleY:1}} viewport={{once:true}} transition={{duration:reducedMotion?0:.4,delay:reducedMotion?0:index*.035,ease:[.22,1,.36,1]}} />
            <small>{label}</small>
          </button>
        ))}
      </div>}
    </DesignCard>
  );
}
export function DesignEquity({ run, className = "", responsivePreview = false }: { run?: Run; className?: string; responsivePreview?: boolean }) {
  if (!run?.curve.length && !responsivePreview) return <DesignCard className={`design-responsive-equity design-equity-empty ${className}`}>
    <header className="responsive-equity-header"><CardTitle icon={designIcons.chart}>Equity &amp; drawdown</CardTitle></header>
    <div className="design-empty-chart"><ChartNoAxesCombined size={38} strokeWidth={1.3}/><h2>{run ? 'No equity data in this run' : 'Your performance starts here'}</h2><p>{run ? 'Choose another saved run to explore its equity and drawdown.' : 'Run your first backtest to see your equity curve and drawdown.'}</p></div>
  </DesignCard>;
  return <ResponsiveEquity key={run?.id || 'public-example'} run={run} className={className} example={responsivePreview}/>;
}
export function StrategyExample({
  name = "BTC trend crossover",
  market = "BTC-USD · 1h",
  result = "+24.80%",
  factor = "1.55",
  trades = "84",
  negative = false,
  onOpen,
  example = false,
}: {
  name?: string;
  market?: string;
  result?: string;
  factor?: string;
  trades?: string;
  negative?: boolean;
  onOpen?: () => void;
  example?: boolean;
}) {
  return (
    <DesignCard
      className={
        "design-strategy-example " + (negative ? "loss-glow" : "profit-glow")
      }
    >
      <div className="design-strategy-title">
        <span className="design-icon" aria-hidden="true">
          <img
            width="15"
            height="15"
            src={`/design/icon-${name.toLowerCase().includes("breakout") ? "breakout" : name.toLowerCase().includes("reversion") ? "reversion" : name.toLowerCase().includes("momentum") ? "momentum" : "cross"}.svg`}
            alt=""
          />
        </span>
        <h3>{name}</h3>
        <span className="design-check-placeholder" aria-hidden="true" />
      </div>
      <p>{market}</p>
      <div className="design-strategy-stats">
        {[
          ["Return", result],
          ["Profit factor", factor],
          ["Trades", trades],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <footer>
        <small>{example ? "Illustrative example · not a saved strategy" : "Saved version 3"}</small>
        {!example && <button className="design-button secondary" onClick={onOpen}>
          Open strategy
        </button>}
      </footer>
    </DesignCard>
  );
}
