import type { Bar, Dataset } from "./types";

function parseTime(date: string, time: string, utcOffset: number): number {
  const d = date.trim().replace(/[./]/g, "-");
  const t = time.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T${t.endsWith("Z") ? t : t + "Z"}` : `${date.trim()} ${t}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000 - utcOffset * 3600) : NaN;
}
export async function importMt5Csv(file: File, symbol: string, point: number, utcOffset: number): Promise<Dataset> {
  if (!symbol.trim()) throw new Error("Enter the MT5 symbol for this file.");
  if (!(point > 0) || !Number.isFinite(utcOffset) || utcOffset < -14 || utcOffset > 14) throw new Error("Check the point size and MT5 time offset.");
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The file has no MT5 bars.");
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(delimiter).map((s) => s.trim().replace(/[<>\"\s]/g, "").toUpperCase());
  const index = (names: string[]) => header.findIndex((h) => names.includes(h));
  const col = { date: index(["DATE"]), time: index(["TIME"]), open: index(["OPEN"]), high: index(["HIGH"]), low: index(["LOW"]), close: index(["CLOSE"]), spread: index(["SPREAD"]), volume: index(["TICKVOL", "TICKVOLUME", "VOL", "VOLUME"]) };
  if ([col.date, col.time, col.open, col.high, col.low, col.close].some((n) => n < 0)) throw new Error("Expected MT5 CSV columns DATE, TIME, OPEN, HIGH, LOW and CLOSE.");
  const bars: Bar[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
    const time = parseTime(cells[col.date], cells[col.time], utcOffset);
    const open = Number(cells[col.open]); const high = Number(cells[col.high]); const low = Number(cells[col.low]); const close = Number(cells[col.close]);
    const spread = col.spread >= 0 ? Number(cells[col.spread]) : 0;
    const volume = col.volume >= 0 ? Number(cells[col.volume]) : 0;
    if (!Number.isFinite(time) || ![open, high, low, close].every((v) => Number.isFinite(v) && v > 0) || high < Math.max(open, close, low) || low > Math.min(open, close, high) || !Number.isFinite(spread) || spread < 0) { skipped++; continue; }
    bars.push({ time, open, high, low, close, spread, volume: Number.isFinite(volume) ? volume : 0 });
  }
  bars.sort((a, b) => a.time - b.time);
  const unique = bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time);
  skipped += bars.length - unique.length;
  if (unique.length < 20) throw new Error("At least 20 valid bars are needed for research.");
  return { id: crypto.randomUUID(), symbol: symbol.trim().toUpperCase(), fileName: file.name, importedAt: Date.now(), utcOffset, point, bars: unique, skipped };
}
