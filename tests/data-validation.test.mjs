import { test } from "node:test";
import assert from "node:assert/strict";
import { validateData } from "../lib/shared/data-validation.js";
const bar = (time) => ({ time, open: 10, high: 11, low: 9, close: 10, volume: 2 });
test("counts leading, internal and trailing missing slots without counting duplicates", () => {
  const result = validateData([bar(180), bar(60), bar(60), bar(300)], 0, 300, 60);
  assert.equal(result.expected, 5);
  assert.equal(result.received, 2);
  assert.equal(result.missing, 3);
  assert.equal(result.gaps, 3);
  assert.equal(result.coveragePct, 40);
});
test("uses UTC aligned slots and excludes end, malformed and off-grid candles", () => {
  const result = validateData([bar(60), bar(120), bar(121), { ...bar(180), high: 1 }, bar(240)], 1, 240, 60);
  assert.equal(result.expected, 3);
  assert.equal(result.received, 2);
  assert.equal(result.longestGap, 1);
});
test("an empty response reports the whole range missing", () => {
  const result = validateData([], 0, 600, 60);
  assert.equal(result.missing, 10);
  assert.equal(result.longestGap, 10);
  assert.equal(result.coveragePct, 0);
});
