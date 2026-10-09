export function estimateSlippage(book, notional) {
  if (!Number.isFinite(notional) || notional <= 0 || notional > 1e9) throw new Error("Choose a valid reference order size.");
  if (book?.auction_mode) throw new Error("Market is in auction; slippage cannot be estimated.");
  const levels = side => {
    if (!Array.isArray(side) || !side.length) throw new Error("Order book is empty.");
    return side.map(row => [Number(row[0]), Number(row[1])]).filter(([price, size]) => Number.isFinite(price) && Number.isFinite(size) && price > 0 && size > 0);
  };
  const bids = levels(book?.bids).sort((a, b) => b[0] - a[0]);
  const asks = levels(book?.asks).sort((a, b) => a[0] - b[0]);
  if (!bids.length || !asks.length || bids[0][0] >= asks[0][0]) throw new Error("Order book quotes are invalid or crossed.");
  const mid = (bids[0][0] + asks[0][0]) / 2;
  const quantity = notional / mid;
  const fill = rows => {
    let remaining = quantity, value = 0;
    for (const [price, size] of rows) { const used = Math.min(size, remaining); value += used * price; remaining -= used; if (remaining <= quantity * 1e-10) break; }
    if (remaining > quantity * 1e-10) throw new Error("Not enough displayed depth for this order size. Use manual slippage.");
    return value / quantity;
  };
  const buyBps = (fill(asks) / mid - 1) * 10000;
  const sellBps = (1 - fill(bids) / mid) * 10000;
  return { slippageBps: Math.ceil(Math.max(0.5, (buyBps + sellBps) / 2) * 10) / 10, buyBps, sellBps, spreadBps: (asks[0][0] - bids[0][0]) / mid * 10000, referenceNotional: notional, sampledAt: Date.now(), method: "Current level-2 book: mean buy/sell VWAP cost versus midpoint, rounded up to 0.1 bps with a heuristic 0.5 bps minimum. Not historical average; no latency or stressed-market allowance." };
}
