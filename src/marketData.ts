import type { Bar, Dataset } from "./types";

export function datasetCoverage(dataset: Dataset) {
  const intervals = dataset.bars.slice(1).map((bar, i) => bar.time - dataset.bars[i].time).sort((a,b) => a-b);
  const seconds = intervals[Math.floor(intervals.length / 2)] || 60;
  const gaps = intervals.reduce((total, interval) => total + Math.max(0, Math.round(interval / seconds) - 1), 0);
  return { seconds, gaps };
}

export function parseMarketCsv(text: string, symbol: string, fileName: string): Dataset {
  if (!symbol.trim()) throw new Error("Choose a market for this CSV.");
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const separator = lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(";") ? ";" : ",";
  const cells = (line: string) => line.split(separator).map(cell => cell.trim().replace(/^"|"$/g, ""));
  const header = cells(lines[0] || "").map(cell => cell.toLowerCase());
  const columns = ["time", "open", "high", "low", "close", "volume"];
  if (columns.some(column => !header.includes(column))) throw new Error("Expected CSV columns: time, open, high, low, close and volume.");
  const bars: Bar[] = [];
  const seen = new Set<number>();
  for (const [index, line] of lines.slice(1).entries()) {
    if (!line.trim()) continue;
    const values = cells(line);
    const value = (column: string) => values[header.indexOf(column)] || "";
    const rawTime = value("time");
    if (!/^\d+(\.\d+)?$/.test(rawTime) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(rawTime)) throw new Error(`Row ${index + 2}: timestamps need a UTC Z or explicit timezone offset.`);
    const numericTime = Number(rawTime);
    const time = /^\d+(\.\d+)?$/.test(rawTime) ? Math.floor(numericTime > 1e12 ? numericTime / 1000 : numericTime) : Date.parse(rawTime) / 1000;
    const prices = ["open", "high", "low", "close"].map(column => Number(value(column)));
    const [open, high, low, close] = prices;
    const volume = Number(value("volume"));
    if (!Number.isFinite(time) || !prices.every(price => Number.isFinite(price) && price > 0) || high < Math.max(open, close, low) || low > Math.min(open, close, high) || !value("volume") || !Number.isFinite(volume) || volume < 0) throw new Error(`Row ${index + 2}: invalid timestamp, OHLC prices or volume.`);
    if (seen.has(time)) throw new Error(`Row ${index + 2}: duplicate timestamp.`);
    seen.add(time);
    bars.push({ time, open, high, low, close, volume, spread: 0 });
  }
  if (bars.length < 20) throw new Error("At least 20 valid candles are needed.");
  bars.sort((a,b) => a.time-b.time);
  return { id: crypto.randomUUID(), symbol: symbol.trim().toUpperCase(), fileName, importedAt: Date.now(), utcOffset: 0, point: 0, bars, skipped: 0 };
}
