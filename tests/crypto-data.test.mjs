import assert from "node:assert/strict";
import { test } from "node:test";
import { getCandles, validateRange } from "../lib/crypto-data.js";

test("historical ranges are not capped at 3,000 candles", () => {
  assert.doesNotThrow(() => validateRange("BTC-USD", 60, 1_700_000_000, 1_700_000_000 + 60 * 100_000));
});

test("candle chunks are fetched one at a time", async () => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let peak = 0;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return { ok: true, json: async () => [] };
  };
  try {
    await getCandles("BTC-USD", 60, 1_700_000_000, 1_700_000_000 + 60 * 301);
    assert.equal(calls, 2);
    assert.equal(peak, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Coinbase rate limits retain their status for the API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  try {
    await assert.rejects(getCandles("BTC-USD", 60, 1_700_000_000, 1_700_000_000 + 60 * 20), (error) => error.status === 429);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
