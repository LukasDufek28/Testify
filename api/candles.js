import { requireUser } from "../lib/auth.js";
import { getCandles } from "../lib/crypto-data.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const user = await requireUser(req, res, "candles", 90);
  if (!user) return;
  try {
    const { product, granularity, start, end } = req.query;
    const bars = await getCandles(String(product || ""), Number(granularity), Number(start), Number(end));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ symbol: product, granularity: Number(granularity), bars, source: "Coinbase Exchange" });
  } catch (error) {
    const invalid = /Choose|supported/.test(error.message || "");
    if (error?.status === 429) res.setHeader("Retry-After", "60");
    return res.status(invalid ? 400 : error?.status === 429 ? 429 : 502).json({ error: error.message || "Could not load crypto candles." });
  }
}
