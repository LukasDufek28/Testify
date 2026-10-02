import test from "node:test";
import assert from "node:assert/strict";
import { parseMarketCsv, datasetCoverage } from "../lib/shared/marketData.js";
const rows = Array.from({ length: 100 }, (_, i) => `${1735689600 + i * 3600},100,102,99,101,20`);
const csv = (data = rows) => `time,open,high,low,close,volume\n${data.join("\n")}`;

test("CSV import preserves all candles, normalizes chronology, and measures coverage", () => {
  const dataset = parseMarketCsv(csv([...rows].reverse()), "BTC-USD", "history.csv");
  assert.equal(dataset.bars.length, 100);
  assert.equal(dataset.bars[0].time, 1735689600);
  assert.deepEqual(datasetCoverage(dataset), { seconds: 3600, gaps: 0 });
  assert.equal(datasetCoverage(parseMarketCsv(csv(rows.filter((_,i)=>i!==50)), "BTC-USD", "gap.csv")).gaps, 1);
});

test("CSV import reports duplicate timestamps, invalid OHLC, and ambiguous timezones", () => {
  assert.throws(() => parseMarketCsv(csv([...rows, rows[0]]), "BTC-USD", "duplicate.csv"), /Row 102: duplicate timestamp/);
  assert.throws(() => parseMarketCsv(csv(["1735689600,100,90,99,101,20",...rows.slice(1)]), "BTC-USD", "invalid.csv"), /Row 2: invalid/);
  assert.throws(() => parseMarketCsv(csv(["2025-01-01T00:00:00,100,102,99,101,20",...rows.slice(1)]), "BTC-USD", "time.csv"), /explicit timezone/);
  assert.throws(() => parseMarketCsv(csv(rows.slice(0,19)), "BTC-USD", "short.csv"), /At least 20/);
});

test("CSV import accepts explicit UTC ISO timestamps and millisecond epoch times", () => {
  const iso = rows.map(row => row.replace(/^\d+/, String(new Date(Number(row.split(',')[0])*1000).toISOString())));
  assert.equal(parseMarketCsv(csv(iso), "BTC-USD", "iso.csv").bars[0].time,1735689600);
  const millis = rows.map(row => row.replace(/^\d+/, String(Number(row.split(',')[0])*1000)));
  assert.equal(parseMarketCsv(csv(millis), "BTC-USD", "millis.csv").bars[0].time,1735689600);
});
