import { requireUser } from "../lib/auth.js";
import { coinbase } from "../lib/crypto-data.js";

let cached, expires = 0, pending;
async function products() {
  if (cached && Date.now() < expires) return cached;
  if (!pending) pending = coinbase("/products").then((result) => {
    if (!Array.isArray(result)) throw new Error("Coinbase returned invalid markets.");
    cached = result; expires = Date.now() + 300000; return result;
  }).finally(() => { pending = undefined; });
  return pending;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const user = await requireUser(req, res, "markets", 30);
  if (!user) return;
  try {
    const rows = await products();
    const markets = rows.filter((p) => (p.quote_currency === "USD" || p.quote_currency === "USDT") && p.status === "online" && !p.trading_disabled && /^[A-Z0-9]{2,20}-(USD|USDT)$/.test(p.id)).map((p) => ({ id: p.id, base: p.base_currency, quote: p.quote_currency })).sort((a, b) => a.id.localeCompare(b.id));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ markets, source: "Coinbase Exchange" });
  } catch (error) { if (error?.status === 429) res.setHeader("Retry-After", "60"); return res.status(error?.status === 429 ? 429 : 502).json({ error: error.message || "Could not load crypto markets." }); }
}
