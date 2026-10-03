import type { Bar } from "./types";

export type DataValidation = { start: number; end: number; granularity: number; expected: number; received: number; missing: number; coveragePct: number; gaps: number; longestGap: number };

export function validateData(bars: Bar[], start: number, end: number, granularity: number): DataValidation {
  if (![start, end, granularity].every(Number.isFinite) || start >= end || granularity <= 0) throw new Error("Invalid data validation range.");
  const first = Math.ceil(start / granularity) * granularity;
  const expected = Math.max(0, Math.ceil((end - first) / granularity));
  const times = [...new Set(bars.filter((b) => b.time >= first && b.time < end && b.time % granularity === 0 && [b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite) && b.low > 0 && b.low <= Math.min(b.open, b.close) && b.high >= Math.max(b.open, b.close) && b.volume >= 0).map((b) => b.time))].sort((a, b) => a - b);
  let cursor = first, gaps = 0, longestGap = 0;
  for (const time of [...times, first + expected * granularity]) {
    const count = Math.max(0, (time - cursor) / granularity);
    if (count) { gaps++; longestGap = Math.max(longestGap, count); }
    cursor = time + granularity;
  }
  return { start, end, granularity, expected, received: times.length, missing: expected - times.length, coveragePct: expected ? times.length / expected * 100 : 100, gaps, longestGap };
}
