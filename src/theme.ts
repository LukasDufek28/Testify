import { sampleCurve } from "./results";
export const PROFIT_COLOR = "#91f5ab";
export const DRAWDOWN_COLOR = "#e69a9a";
const LOSS_PERCENT_SCALE = 10;

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
  const lossFloor = percent ? -LOSS_PERCENT_SCALE : baseline > 0 ? baseline * (1 - LOSS_PERCENT_SCALE / 100) : baseline - LOSS_PERCENT_SCALE;
  const lossColor = metricColor(baseline > 0 ? (low / baseline - 1) * 100 / LOSS_PERCENT_SCALE : low / LOSS_PERCENT_SCALE);
  const color = low >= baseline ? PROFIT_COLOR : high === low ? lossColor : {
    type: "linear", x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [{offset:0,color:high >= baseline ? PROFIT_COLOR : metricColor(baseline > 0 ? (high / baseline - 1) * 100 / LOSS_PERCENT_SCALE : high / LOSS_PERCENT_SCALE)},...(high > baseline ? [{offset:threshold,color:PROFIT_COLOR}] : []),...(high > lossFloor && low < lossFloor ? [{offset:(high-lossFloor)/(high-low),color:DRAWDOWN_COLOR}] : []),{offset:1,color:lossColor}],
  };
  // A single series keeps hover/legend emphasis from hiding a profit overlay.
  return [{ name, type: "line", showSymbol: false, emphasis: { disabled: true },
    lineStyle: { width: 3, type: dashed ? "dashed" : "solid", color },
    data: data.map(point => point.slice(0, 2)),
  }];
}

export function drawdownColors(_points: { equity: number }[]) {
  return { type: "continuous", show: false, dimension: 1, min: -LOSS_PERCENT_SCALE, max: 0, inRange: { color: [DRAWDOWN_COLOR, "#ffffff"] } };
}

// Fixed scales keep the same value the same color across saved runs.
export function metricTone(label: string, value: number): number {
  if (!Number.isFinite(value)) return value === Infinity && label === "Profit factor" ? 1 : 0;
  switch (label) {
    case "Return": case "Net profit": return value / LOSS_PERCENT_SCALE;
    case "Win rate": return (value - 50) / 25;
    case "Profit factor": return value >= 1 ? (value - 1) / 2 : (value - 1) * 2;
    case "Average R": return value * 2;
    case "Max drawdown": return -Math.abs(value) / LOSS_PERCENT_SCALE;
    default: return 0;
  }
}
export function metricColor(tone: number) {
  const amount = 1 + Math.max(-1, Math.min(0, tone));
  const rose = [230, 154, 154];
  return `rgb(${rose.map(channel => Math.round(channel + (255 - channel) * amount)).join(", ")})`;
}

export const metricScaleHint: Record<string, string> = {
  "Net profit": "White at zero or positive return; losses fade to rose at −10%.",
  "Return": "White at zero or positive return; losses fade to rose at −10%.",
  "Win rate": "White at 50% or above; lower win rates fade to rose at 25%.",
  "Profit factor": "White at 1 or above; lower factors fade to rose at 0.5.",
  "Average R": "White at zero or above; losses fade to rose at −0.5R.",
  "Max drawdown": "White at 0%; deeper drawdown fades to orange at 10%.",
};
