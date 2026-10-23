import {getDisplayTimezone} from './RunDefaults';
import { motion, useInView, useMotionTemplate, useReducedMotion, useSpring } from "motion/react";
import GraphNumber from "./GraphNumber";
import useCardTilt from './useCardTilt';
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Run } from "./types";
import { sampleCurve } from "./results";
import curves from "./previewCurves.json";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const left = 67, right = 803, top = 77, bottom = 300;

function pathY(path: SVGPathElement, x: number) {
  let lo = 0, hi = path.getTotalLength();
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    if (path.getPointAtLength(mid).x < x) lo = mid;
    else hi = mid;
  }
  return path.getPointAtLength((lo + hi) / 2).y;
}

export default function ResponsiveEquity({ run, className = "", example = false }: { run?: Run; className?: string; example?: boolean }) {
  const tilt=useCardTilt();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, {once:true,amount:.1});
  const equityPath = useRef<SVGPathElement>(null);
  const lossPath = useRef<SVGPathElement>(null);
  const id = useId().replaceAll(":", "");
  const [width, setWidth] = useState(836);
  const [selected, setSelected] = useState<number | null>(null);
  const [previewY, setPreviewY] = useState({ equity: 190, loss: 185 });
  const data = useMemo(() => {
    if (!run?.curve.length) return null;
    const points = sampleCurve(run.curve);
    let peak = run.settings.capital;
    const losses = points.map(p => { peak = Math.max(peak, p.equity); return peak > 0 ? (peak - p.equity) / peak * 100 : 0; });
    const values = points.map(p => p.equity);
    const low = Math.min(run.settings.capital, ...values), high = Math.max(run.settings.capital, ...values);
    const padding = Math.max(1, (high - low) * .1);
    return { points, losses, min: low - padding, max: high + padding, maxLoss: Math.max(10, Math.ceil(Math.max(...losses) / 10) * 10) };
  }, [run]);
  const count = data?.points.length || 12;
  const ratio = selected ?? (data ? Math.floor(count / 2) / Math.max(1,count-1) : 4 / 11);
  const position = ratio * (count - 1);
  const index = Math.min(count - 1, Math.floor(position));
  const next = Math.min(count - 1,index+1), fraction = position-index;
  const interpolate = (a:number,b:number) => a+(b-a)*fraction;
  const plotX = left + ratio * (right - left);
  const min = data?.min ?? 10000, max = data?.max ?? 25000, maxLoss = data?.maxLoss ?? 40;
  const toY = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const lossY = (value: number) => bottom - value / maxLoss * (bottom - top);
  // Pointer movement changes the cursor, not the saved series geometry.
  const [equityD,lossD] = useMemo(() => data ? [
    data.points.map((p, i) => `${i ? "L" : "M"}${left + i / Math.max(1, count - 1) * (right - left)},${bottom - (p.equity-min)/(max-min)*(bottom-top)}`).join(""),
    data.losses.map((v, i) => `${i ? "L" : "M"}${left + i / Math.max(1, count - 1) * (right - left)},${bottom-v/maxLoss*(bottom-top)}`).join(""),
  ] : [curves.equity.d,curves.drawdown.d], [data,count,min,max,maxLoss]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [!!data,example]);
  useEffect(() => {
    if (data || !equityPath.current || !lossPath.current) return;
    setPreviewY({ equity: pathY(equityPath.current, plotX), loss: pathY(lossPath.current, plotX) });
  }, [data, plotX]);
  const balance = data ? interpolate(data.points[index].equity,data.points[next].equity) : selected===null ? 20037 : max - (previewY.equity - top) / (bottom - top) * (max - min);
  const loss = data ? interpolate(data.losses[index],data.losses[next]) : selected===null ? 20.6 : Math.max(0, (bottom - previewY.loss) / (bottom - top) * maxLoss);
  const timestamp = data ? interpolate(data.points[index].time,data.points[next].time)*1000 : Date.UTC(2026,0,1)+ratio*(Date.UTC(2026,11,31)-Date.UTC(2026,0,1));
  const date = !data && selected===null ? 'May 2026' : new Date(timestamp).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: getDisplayTimezone() });
  const equityStep=(max-min)/3;
  const magnitude=Math.max(Math.abs(min),Math.abs(max));
  const axisUnit=magnitude>=1000000?1000000:magnitude>=1000&&equityStep>=100?1000:1;
  const axisDigits=Math.max(0,Math.min(8,Math.ceil(-Math.log10(equityStep/axisUnit))));
  const equityLabels=Array.from({length:4},(_,i)=>( (max-i*equityStep)/axisUnit).toLocaleString('en-US',{maximumFractionDigits:axisDigits})+(axisUnit===1000000?'m':axisUnit===1000?'k':''));
  const gutter = Math.max(width < 480 ? 34 : 49,Math.max(...equityLabels.map(label=>label.length))*6+9);
  const rightGutter = width < 480 ? 34 : 15;
  const plotWidth = Math.max(1, width - gutter - rightGutter);
  const height = width < 480 ? 194 : Math.min(320, Math.max(210, width * .27875));
  const svgHeight = height + (width < 480 ? 38 : 26);
  const x = gutter + ratio * plotWidth;
  const y = data ? toY(balance) : previewY.equity;
  const dy = data ? lossY(loss) : previewY.loss;
  const screenY = (value: number) => (value - top) / (bottom - top) * height;
  const ticks = width < 480 ? 4 : width < 700 ? 7 : 12;
  const reduced=useReducedMotion();
  const springOptions={stiffness:440,damping:38,mass:.45};
  const cursorX=useSpring(x,springOptions),cursorY=useSpring(screenY(y),springOptions),drawdownY=useSpring(screenY(dy),springOptions);
  const tipTargetX=Math.max(gutter,Math.min(width-129,x+16));
  const tipTargetY=Math.max(10,Math.min(height-98,screenY(y)+20));
  const tipX=useSpring(tipTargetX,springOptions),tipY=useSpring(tipTargetY,springOptions);
  const tipLeft=useMotionTemplate`clamp(0px, ${tipX}px, calc(100% - 119px))`;
  const previousWidth=useRef(width);
  useEffect(()=>{
    const instant=reduced || previousWidth.current!==width;
    for(const [spring,target] of [[cursorX,x],[cursorY,screenY(y)],[drawdownY,screenY(dy)],[tipX,tipTargetX],[tipY,tipTargetY]] as const) {
      if(instant)spring.jump(target);else spring.set(target);
    }
    previousWidth.current=width;
  },[x,y,dy,width,height,tipTargetX,tipTargetY,reduced,cursorX,cursorY,drawdownY,tipX,tipY]);
  function select(clientX: number) {
    const box = root.current?.getBoundingClientRect();
    if (box) setSelected(Math.max(0, Math.min(1, (clientX - box.left - gutter) / plotWidth)));
  }
  if (!data && !example) return <motion.section {...tilt} className={`design-card design-responsive-equity design-equity-empty ${className}`}>
    <header className="responsive-equity-header"><div className="design-card-title"><span className="design-icon"><img src="/design/icon-chart.svg" width="15" height="15" alt=""/></span><span>Equity &amp; drawdown</span></div></header>
    <div className="design-empty-chart"><svg width="44" height="32" viewBox="0 0 44 32" fill="none" aria-hidden="true"><path d="M2 2v28h40M8 23l9-9 8 5 11-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg><h2>{run ? 'No equity data in this run' : 'Your performance starts here'}</h2><p>{run ? 'Choose another saved run to explore its equity and drawdown.' : 'Run your first backtest to see your equity curve and drawdown.'}</p></div>
  </motion.section>;
  return <motion.section {...tilt} className={`design-card design-responsive-equity ${data ? "design-live-chart" : ""} ${className}`}>
    <header className="responsive-equity-header">
      <div className="design-card-title"><span className="design-icon"><img src="/design/icon-chart.svg" width="15" height="15" alt="" /></span><span>Equity &amp; drawdown</span></div>
      <div className="responsive-equity-legend"><span><i />Equity</span><span><i />Drawdown</span></div>
    </header>
    <div ref={root} className="design-equity landing-chart-demo responsive-equity-plot" role="group" tabIndex={0}
      aria-label={`${data ? "Saved backtest" : "Preview"} equity and drawdown. Use arrow keys to explore.`}
      onPointerMove={e => select(e.clientX)} onPointerDown={e => select(e.clientX)}
      onKeyDown={e => { if (["Home", "End", "ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setSelected(e.key === "Home" ? 0 : e.key === "End" ? 1 : Math.max(0, Math.min(1, ratio + (e.key === "ArrowRight" ? 1 : -1)/Math.max(1,count-1)))); } }}>
      <svg className="landing-chart-image" width="100%" height={svgHeight} viewBox={`0 -8 ${width} ${svgHeight}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stopColor="white" stopOpacity=".72" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient>
          <linearGradient id={`${id}-equity`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#395f49" /><stop offset=".36" stopColor="#9beead" /><stop offset=".55" stopColor="#90e5a5" /><stop offset="1" stopColor="#385d4a" /></linearGradient>
          <mask id={`${id}-mask`}><rect x={left} y={top} width={right - left} height={bottom - top} fill={`url(#${id}-fade)`} /></mask>
          <pattern id={`${id}-stripes`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(42)"><rect width="4" height="10" fill="#e69a9a" opacity=".45" /></pattern>
          <clipPath id={`${id}-reveal`}>
            {/* Reveal in plot coordinates: normalized dash lengths truncate a
                non-scaling stroke when the responsive group is enlarged. */}
            <motion.rect key={(run?.id||'preview')+'-reveal'} data-chart="reveal" x={left-2} y={-1000} height={3000} width={right-left+4} initial={reduced?false:{width:0}} animate={{width:reduced||inView?right-left+4:0}} transition={{duration:reduced?0:.75,ease:[.22,1,.36,1]}} />
          </clipPath>
        </defs>
        {equityLabels.map((label,i) => <text key={i} data-axis="equity" x="1" y={5 + i * (height - 10) / 3} fill="#66636e" fontSize="11">{label}</text>)}
        {[0, 1, 2, 3, 4].map(i => <text key={i} x={width - 1} y={5 + i * (height - 10) / 4} textAnchor="end" fill="#66636e" fontSize="11">{Math.round(maxLoss - i * maxLoss / 4)}%</text>)}
        <g transform={`translate(${gutter} 0) scale(${plotWidth / (right - left)} ${height / (bottom - top)}) translate(${-left} ${-top})`}>
          <motion.path key={(run?.id||'preview')+'-area'} initial={reduced?false:{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} animate={reduced?{opacity:1}:undefined} transition={{duration:reduced?0:.5,delay:reduced?0:.15}} d={`${lossD}L${right},${bottom}L${left},${bottom}Z`} fill={`url(#${id}-stripes)`} mask={`url(#${id}-mask)`} />
          <g clipPath={`url(#${id}-reveal)`}>
            <path ref={lossPath} data-chart="benchmark" d={lossD} fill="none" stroke="#e69a9a" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            <path ref={equityPath} data-chart="strategy" d={equityD} fill="none" stroke={`url(#${id}-equity)`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </g>
        </g>
        <motion.line x1={cursorX} x2={cursorX} y1="0" y2={height} stroke="#9e9da7" strokeWidth=".8" />
        <motion.circle data-chart="equity-marker" cx={cursorX} cy={cursorY} r="3" fill="#91f5ab" /><motion.circle cx={cursorX} cy={drawdownY} r="3" fill="#e69a9a" />
        <motion.circle cx={cursorX} cy={cursorY} initial={false} animate={{r:selected===null?3:7,opacity:selected===null?0:.6}} transition={{duration:reduced?0:.16}} fill="none" stroke="#91f5ab"/>
        {Array.from({ length: ticks }, (_, i) => { const j = Math.round(i / (ticks - 1) * (count - 1)); return <text key={i} x={gutter + i / (ticks - 1) * plotWidth} y={height + 14} textAnchor="middle" fontSize="11" fill="#9e9da7">{data ? new Date(data.points[j].time * 1000).toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: getDisplayTimezone() }) : months[j]}</text>; })}
      </svg>
      <motion.div className="responsive-equity-tooltip" data-motion-chart-tooltip style={{left:tipLeft,top:tipY}}>
        <span data-chart="month">{date}</span><div><i /><span data-chart="strategy-value"><GraphNumber value={balance}/></span></div><div><i /><span><GraphNumber value={loss} percent/></span></div>
      </motion.div>
    </div>
  </motion.section>;
}
