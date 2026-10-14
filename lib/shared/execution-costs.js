function adversePrice(price, side, entering, settings) {
  return price * (1 + (entering ? side : -side) * (settings.slippageBps + (settings.spreadBps ?? 0) / 2) / 1e4);
}
function executionFee(units, price, settings, fraction = 1) {
  return settings.feePerTrade !== void 0 ? settings.feePerTrade / 2 * fraction : Math.abs(units * price) * settings.feeBps / 1e4;
}
function validateExecutionOverrides(settings) {
  if (settings.feePerTrade !== void 0 && (!Number.isFinite(settings.feePerTrade) || settings.feePerTrade < 0 || settings.feePerTrade > 1e9)) throw new Error("Fixed trade fee must be between 0 and 1,000,000,000.");
  if (settings.riskPct !== void 0 && (!Number.isFinite(settings.riskPct) || settings.riskPct < 0 || settings.riskPct > 10)) throw new Error("Risk must be between 0 and 10% of equity.");
  if (settings.spreadBps !== void 0 && (!Number.isFinite(settings.spreadBps) || settings.spreadBps < 0 || settings.spreadBps > 1e3)) throw new Error("Spread must be between 0 and 1000 basis points.");
}
export {
  adversePrice,
  executionFee,
  validateExecutionOverrides
};
