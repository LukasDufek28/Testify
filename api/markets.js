import { coinbase } from "../lib/crypto-data.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const products = await coinbase("/products");
    if (!Array.isArray(products)) throw new Error("Coinbase returned invalid markets.");
    const markets = products.filter((p) => (p.quote_currency === "USD" || p.quote_currency === "USDT") && p.status === "online" && !p.trading_disabled && /^[A-Z0-9]{2,20}-(USD|USDT)$/.test(p.id)).map((p) => ({ id: p.id, base: p.base_currency, quote: p.quote_currency })).sort((a, b) => a.id.localeCompare(b.id));
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ markets, source: "Coinbase Exchange" });
  } catch (error) { return res.status(502).json({ error: error.message || "Could not load crypto markets." }); }
}
