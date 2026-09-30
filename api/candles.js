import { getCandles } from "../lib/crypto-data.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const { product, granularity, start, end } = req.query;
    const bars = await getCandles(String(product || ""), Number(granularity), Number(start), Number(end));
    if (bars.length < 20) return res.status(422).json({ error: "This market has too few candles in the selected period. Try a wider range." });
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ symbol: product, granularity: Number(granularity), bars, source: "Coinbase Exchange" });
  } catch (error) {
    const invalid = /Choose|supported|3,000/.test(error.message || "");
    return res.status(invalid ? 400 : 502).json({ error: error.message || "Could not load crypto candles." });
  }
}
