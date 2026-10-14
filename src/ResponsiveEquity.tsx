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

export default function ResponsiveEquity({ run, className = "" }: { run?: Run; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
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
  const index = Math.min(count - 1, selected ?? (data ? Math.floor(count / 2) : 4));
  const ratio = index / Math.max(1, count - 1);
  const plotX = left + ratio * (right - left);
  const min = data?.min ?? 10000, max = data?.max ?? 25000, maxLoss = data?.maxLoss ?? 40;
  const toY = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const lossY = (value: number) => bottom - value / maxLoss * (bottom - top);
  const equityD = data ? data.points.map((p, i) => `${i ? "L" : "M"}${left + i / Math.max(1, count - 1) * (right - left)},${toY(p.equity)}`).join("") : curves.equity.d;
  const lossD = data ? data.losses.map((v, i) => `${i ? "L" : "M"}${left + i / Math.max(1, count - 1) * (right - left)},${lossY(v)}`).join("") : curves.drawdown.d;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (data || !equityPath.current || !lossPath.current) return;
    setPreviewY({ equity: pathY(equityPath.current, plotX), loss: pathY(lossPath.current, plotX) });
  }, [data, plotX]);
  const balance = data ? data.points[index].equity : index === 4 ? 20037 : max - (previewY.equity - top) / (bottom - top) * (max - min);
  const loss = data ? data.losses[index] : index === 4 ? 20.6 : Math.max(0, (bottom - previewY.loss) / (bottom - top) * maxLoss);
  const date = data ? new Date(data.points[index].time * 1000).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : months[index] + " 2026";
  const gutter = width < 480 ? 34 : 49;
  const rightGutter = width < 480 ? 34 : 15;
  const plotWidth = Math.max(1, width - gutter - rightGutter);
  const height = width < 480 ? 194 : Math.min(320, Math.max(210, width * .27875));
  const svgHeight = height + (width < 480 ? 38 : 26);
  const x = gutter + ratio * plotWidth;
  const y = data ? toY(data.points[index].equity) : previewY.equity;
  const dy = data ? lossY(data.losses[index]) : previewY.loss;
  const screenY = (value: number) => (value - top) / (bottom - top) * height;
  const ticks = width < 480 ? 4 : width < 700 ? 7 : 12;
  function select(clientX: number) {
    const box = root.current?.getBoundingClientRect();
    if (box) setSelected(Math.max(0, Math.min(count - 1, Math.round((clientX - box.left - gutter) / plotWidth * (count - 1)))));
  }
  return <section className={`design-card design-responsive-equity ${data ? "design-live-chart" : ""} ${className}`}>
    <header className="responsive-equity-header">
      <div className="design-card-title"><span className="design-icon"><img src="/design/icon-chart.svg" width="15" height="15" alt="" /></span><span>Equity &amp; drawdown</span></div>
      <div className="responsive-equity-legend"><span><i />Equity</span><span><i />Drawdown</span></div>
    </header>
    <div ref={root} className="design-equity landing-chart-demo responsive-equity-plot" role="group" tabIndex={0}
      aria-label={`${data ? "Saved backtest" : "Preview"} equity and drawdown. Use arrow keys to explore.`}
      onPointerMove={e => select(e.clientX)} onPointerDown={e => select(e.clientX)} onPointerLeave={() => setSelected(null)}
      onKeyDown={e => { if (["Home", "End", "ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setSelected(e.key === "Home" ? 0 : e.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, index + (e.key === "ArrowRight" ? 1 : -1)))); } }}>
      <svg className="landing-chart-image" width="100%" height={svgHeight} viewBox={`0 -8 ${width} ${svgHeight}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stopColor="white" stopOpacity=".72" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient>
          <linearGradient id={`${id}-equity`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#395f49" /><stop offset=".36" stopColor="#9beead" /><stop offset=".55" stopColor="#90e5a5" /><stop offset="1" stopColor="#385d4a" /></linearGradient>
          <mask id={`${id}-mask`}><rect x={left} y={top} width={right - left} height={bottom - top} fill={`url(#${id}-fade)`} /></mask>
          <pattern id={`${id}-stripes`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(42)"><rect width="4" height="10" fill="#e69a9a" opacity=".45" /></pattern>
        </defs>
        {[0, 1, 2, 3].map(i => <text key={i} x="1" y={5 + i * (height - 10) / 3} fill="#66636e" fontSize="11">{((max - i * (max - min) / 3) / 1000).toFixed(max >= 10000 ? 0 : 1)}k</text>)}
        {[0, 1, 2, 3, 4].map(i => <text key={i} x={width - 1} y={5 + i * (height - 10) / 4} textAnchor="end" fill="#66636e" fontSize="11">{Math.round(maxLoss - i * maxLoss / 4)}%</text>)}
        <g transform={`translate(${gutter} 0) scale(${plotWidth / (right - left)} ${height / (bottom - top)}) translate(${-left} ${-top})`}>
          <path d={`${lossD}L${right},${bottom}L${left},${bottom}Z`} fill={`url(#${id}-stripes)`} mask={`url(#${id}-mask)`} />
          <path ref={lossPath} data-chart="benchmark" d={lossD} fill="none" stroke="#e69a9a" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <path ref={equityPath} data-chart="strategy" d={equityD} fill="none" stroke={`url(#${id}-equity)`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </g>
        <line x1={x} x2={x} y1="0" y2={height} stroke="#9e9da7" strokeWidth=".8" />
        <circle cx={x} cy={screenY(y)} r="3" fill="#91f5ab" /><circle cx={x} cy={screenY(dy)} r="3" fill="#e69a9a" />
        {Array.from({ length: ticks }, (_, i) => { const j = Math.round(i / (ticks - 1) * (count - 1)); return <text key={i} x={gutter + i / (ticks - 1) * plotWidth} y={height + 14} textAnchor="middle" fontSize="11" fill="#9e9da7">{data ? new Date(data.points[j].time * 1000).toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" }) : months[j]}</text>; })}
      </svg>
      <div className="responsive-equity-tooltip" style={{ left: `clamp(0px, ${Math.max(gutter, Math.min(width - 129, x + 16))}px, calc(100% - 119px))`, top: Math.max(10, Math.min(height - 98, screenY(y) + 20)) }}>
        <span data-chart="month">{date}</span><div><i /><span data-chart="strategy-value">${Math.round(balance).toLocaleString("en-US")}</span></div><div><i /><span>{loss.toFixed(1)}%</span></div>
      </div>
    </div>
  </section>;
}
