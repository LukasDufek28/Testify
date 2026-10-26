import { useId, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
import type { EquitySeries } from "./types";
import ResponsiveEquity from "./ResponsiveEquity";
import AnimatedValue from './AnimatedValue';
import useCardTilt from './useCardTilt';
import { motion, type HTMLMotionProps } from "motion/react";
import {calendarMonthlyReturns} from './portfolio';
import {quickFade,surfaceSpring} from './motion-tokens';
import useReducedMotion from './useReducedMotionPreference';
import "./penpot.css";
import './monthly-returns.css';

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
const sampleProfits = [143,258,387,564,381,272,408,-120,180,320,-95,260];
export function DesignMonthly({
  run,
  example = false,
  className = "",
}: {
  run?: EquitySeries;
  example?: boolean;
  className?: string;
}) {
  const [chosenYear,setYear]=useState<number|null>(null),[active,setActive]=useState<number|null>(null);
  const tooltipId=useId(),reducedMotion=useReducedMotion();
  const returns=useMemo(()=>run?calendarMonthlyReturns(run):example?sampleProfits.map((profit,month)=>({key:`example-${month}`,year:2026,month,profit,returnPct:profit/100})):[],[run?.curve,run?.settings.capital,example]);
  const years=[...new Set(returns.map(item=>item.year))],year=chosenYear!==null&&years.includes(chosenYear)?chosenYear:years.at(-1),yearIndex=years.indexOf(year!);
  const average=returns.length?returns.reduce((sum,item)=>sum+item.profit,0)/returns.length:null;
  const percentages=returns.filter(item=>item.returnPct!==null),averagePct=percentages.length?percentages.reduce((sum,item)=>sum+item.returnPct!,0)/percentages.length:null;
  const bars=returns.length?months.map((label,month)=>({label,...(returns.find(item=>item.year===year&&item.month===month)??{key:`${year}-${month}`,year:year!,profit:0,returnPct:0})})):[];
  const max=Math.max(Number.EPSILON,...bars.map(item=>Math.abs(item.profit)));
  const money=(value:number,digits=2)=>(value<0?'−':'')+'$'+Math.abs(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const percent=(value:number|null)=>value===null?'—':(value>0?'+':value<0?'−':'')+Math.abs(value).toFixed(2)+'%';
  const changeYear=(index:number)=>{setYear(years[index]);setActive(null);};
  return (
    <DesignCard className={`design-monthly design-monthly-calendar ${average===null||Math.abs(average)<1e-8?'':average<0?'loss-glow':'profit-glow'} ${className}`}>
      <div className="design-monthly-heading">
        <div className="monthly-title"><CardTitle icon={designIcons.monthly}>Monthly returns</CardTitle>
         {year!==undefined&&<div className="monthly-year">{years.length>1&&<button type="button" aria-label="Previous monthly returns year" disabled={yearIndex===0} onClick={()=>changeYear(yearIndex-1)}><ChevronLeft size={13}/></button>}<span>{example&&!run?'Illustrative year':year}</span>{years.length>1&&<button type="button" aria-label="Next monthly returns year" disabled={yearIndex===years.length-1} onClick={()=>changeYear(yearIndex+1)}><ChevronRight size={13}/></button>}</div>}
        </div>
        <div className="monthly-summary" title={returns.length?`Average across ${returns.length} month${returns.length===1?'':'s'} in the recorded portfolio period. Months outside this period are excluded.`:undefined}>
          <span className="monthly-average-label">Average / month</span>
          <strong>{average===null?'—':money(average)}</strong>
          <small>{average===null?'No saved returns':percent(averagePct)}</small>
        </div>
      </div>
      {!bars.length && <div className="design-empty-chart"><CalendarDays size={26} strokeWidth={1.3}/><p>Your monthly returns will appear after your first backtest.</p></div>}
      {!!bars.length && <div className="design-monthly-bars is-calendar" onPointerLeave={()=>setActive(null)}>
        {bars.map(({key,label,profit,returnPct}, index) => (
          <button
            type="button" key={(run?.id || 'preview')+key}
            aria-label={`${label} monthly return: ${money(profit)}, ${percent(returnPct)}`}
            aria-describedby={active===index?tooltipId:undefined}
            aria-pressed={active===index}
            onClick={event=>{event.currentTarget.focus();setActive(index);}} onPointerEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)}
            data-return={profit<0?'loss':profit>0?'gain':'zero'}
          >
            <motion.span className="monthly-bar-enter" style={{height:Math.max(3,Math.abs(profit)/max*100)+'%',transformOrigin:'50% 100%'}} initial={reducedMotion?false:{scaleY:0}} whileInView={{scaleY:1}} viewport={{once:true}} transition={{duration:reducedMotion?0:.4,delay:reducedMotion?0:index*.025,ease:[.22,1,.36,1]}}><motion.span className="monthly-bar-fill" animate={{scale:!reducedMotion&&active===index?1.07:1}} transition={reducedMotion?{duration:0}:surfaceSpring}/></motion.span>
            <small>{label}</small>
            {active===index&&<motion.span id={tooltipId} role="tooltip" className={`monthly-tooltip ${index<3?'at-start':index>8?'at-end':''}`} style={{bottom:`calc(${Math.max(3,Math.abs(profit)/max*100)}% + 8px)`}} initial={reducedMotion?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={reducedMotion?{duration:0}:quickFade}><span>{label} {example&&!run?'':year}</span><strong>{money(profit)}</strong><span>{percent(returnPct)}{profit===0?' · No recorded change':''}</span></motion.span>}
          </button>
        ))}
      </div>}
    </DesignCard>
  );
}
export function DesignEquity({ run, className = "", responsivePreview = false }: { run?: EquitySeries; className?: string; responsivePreview?: boolean }) {
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
