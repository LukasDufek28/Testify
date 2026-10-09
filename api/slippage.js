import { requireUser } from "../lib/auth.js";
import { coinbase } from "../lib/crypto-data.js";
import { estimateSlippage } from "../lib/slippage.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  if (!await requireUser(req, res, "slippage", 90)) return;
  const product = String(req.query.product || "");
  const notional = Number(req.query.notional);
  if (!/^[A-Z0-9]{2,20}-(USD|USDT)$/.test(product) || !Number.isFinite(notional) || notional <= 0 || notional > 1e9) return res.status(400).json({ error: "Choose a valid market and reference order size." });
  try {
    const book = await coinbase(`/products/${product}/book?level=2`);
    return res.status(200).json({ symbol: product, ...estimateSlippage(book, notional) });
  } catch (error) {
    if (error.status === 429) res.setHeader("Retry-After", "60");
    return res.status(error.status === 429 ? 429 : 502).json({ error: error.message || "Could not estimate slippage." });
  }
}
