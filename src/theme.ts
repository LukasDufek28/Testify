import { sampleCurve } from "./results";
export const PROFIT_COLOR = "#f2842f";
export const DRAWDOWN_COLOR = "#455b8a";

export function equityData(points: { time: number; equity: number }[], percent = false) {
  let peak = percent ? 0 : points[0]?.equity ?? 0;
  const data = points.map(point => {
    const positive = point.equity >= peak && point.equity > (percent ? 0 : points[0]?.equity ?? 0);
    peak = Math.max(peak, point.equity);
    return [point.time * 1000, point.equity, positive ? 1 : 0];
  });
  const byPoint = new Map(points.map((point, index) => [point, data[index]]));
  return sampleCurve(points).map(point => byPoint.get(point)!);
}
export function equityLines(name: string, points: { time: number; equity: number }[], percent = false, dashed = false) {
  const data = equityData(points, percent);
  const common = { name, type: "line", showSymbol: false, connectNulls: false, lineStyle: { width: 2, type: dashed ? "dashed" : "solid" } };
  return [
    { ...common, lineStyle: { ...common.lineStyle, width: 3, color: DRAWDOWN_COLOR }, itemStyle: { color: DRAWDOWN_COLOR }, data: data.map(point => point.slice(0, 2)) },
    { ...common, tooltip: { show: false }, lineStyle: { ...common.lineStyle, color: PROFIT_COLOR }, itemStyle: { color: PROFIT_COLOR }, data: data.map((point, index) => [point[0], point[2] || data[index + 1]?.[2] ? point[1] : null]) },
  ];
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
