import { sampleCurve } from "./results";
export const PROFIT_COLOR = "#f2842f";
export const DRAWDOWN_COLOR = "#455b8a";

export function equityData(points: { time: number; equity: number }[], percent = false, capital?: number) {
  const baseline = percent ? 0 : capital ?? points[0]?.equity ?? 0;
  return sampleCurve(points).map(point => [point.time * 1000, point.equity, point.equity > baseline ? 1 : 0]);
}
export function equityLines(name: string, points: { time: number; equity: number }[], percent = false, dashed = false, capital?: number) {
  const data = equityData(points, percent, capital);
  const baseline = percent ? 0 : capital ?? points[0]?.equity ?? 0;
  const low = data.reduce((value, point) => Math.min(value, point[1]), Infinity);
  const high = data.reduce((value, point) => Math.max(value, point[1]), -Infinity);
  const threshold = (high - baseline) / (high - low);
  const color = high === low && high === baseline ? "#ffffff" : low >= baseline ? PROFIT_COLOR : high <= baseline ? DRAWDOWN_COLOR : {
    type: "linear", x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [{offset:0,color:PROFIT_COLOR},{offset:threshold,color:PROFIT_COLOR},{offset:threshold,color:DRAWDOWN_COLOR},{offset:1,color:DRAWDOWN_COLOR}],
  };
  // A single series keeps hover/legend emphasis from hiding a profit overlay.
  return [{ name, type: "line", showSymbol: false, emphasis: { disabled: true },
    lineStyle: { width: 3, type: dashed ? "dashed" : "solid", color },
    data: data.map(point => point.slice(0, 2)),
  }];
}

export function drawdownColors(points: { equity: number }[]) {
  const deepest = points.reduce((lowest, point) => Math.min(lowest, point.equity), 0);
  return { type: "continuous", show: false, dimension: 1, min: Math.min(-1, deepest), max: 0, inRange: { color: [DRAWDOWN_COLOR, PROFIT_COLOR] } };
}

// Fixed scales keep the same value the same color across saved runs.
export function metricTone(label: string, value: number): number {
  if (!Number.isFinite(value)) return value === Infinity && label === "Profit factor" ? 1 : 0;
  switch (label) {
    case "Return": case "Net profit": return value / 20;
    case "Win rate": return (value - 50) / 50;
    case "Profit factor": return value >= 1 ? (value - 1) / 2 : value - 1;
    case "Average R": return value;
    case "Max drawdown": return -Math.abs(value) / 30;
    default: return 0;
  }
}
export function metricColor(tone: number) {
  const amount = Math.min(1, Math.abs(tone));
  const target = tone >= 0 ? [242, 132, 47] : [69, 91, 138];
  return `rgb(${target.map(channel => Math.round(255 + (channel - 255) * amount)).join(", ")})`;
}

export const metricScaleHint: Record<string, string> = {
  "Net profit": "Color uses return on starting capital: white at 0%, orange at +20%, blue at −20%.",
  "Return": "Color range: blue at −20%, white at 0%, orange at +20%.",
  "Win rate": "Color range: blue at 0%, white at 50%, orange at 100%.",
  "Profit factor": "Color range: blue at 0, white at 1, orange at 3.",
  "Average R": "Color range: blue at −1R, white at 0R, orange at +1R.",
  "Max drawdown": "Color range: white at 0%, blue at 30% drawdown.",
};
