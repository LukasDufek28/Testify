# Testify

Testify is an online crypto strategy research service deployed on Vercel. It needs no local program, MT5 terminal, account, or paid database.

## Research flow

1. Choose a Coinbase Exchange USD or USDT spot market, candle interval, and historical period. Public market data loads in manageable chunks, with no Testify candle-count cap.
2. Write a JSON strategy or ask Gemini to draft one. Version 2 supports original indicators built from formula trees; existing version 1 strategies still work. The site owner's shared `GEMINI_API_KEY` stays in Vercel; visitors need no key.
3. Check one or more markets on the Backtests page, then run them sequentially. Each completed result is saved on the History page. A failed market does not stop the remaining markets. Vercel retrieves candles in batches; the strategy engine runs in a cancellable browser worker. Signals are evaluated at bar close; fills happen no earlier than the next bar open. Fees, slippage, stops, and targets are modeled.
4. Review or clear saved results on History. Portfolio lab has an individual-lines view and a combined curve. The combined view adds each selected run's percentage return against one reference capital: a -10% run and a +15% run display +5%. This assumes full starting capital for every run, so exposure rises with the number of selected runs. Chosen datasets, strategies, and results are stored in each browser with IndexedDB. Export a backup to move them to another device.

The research engine models one spot pair and one position per run. It does not place orders. Short trades are hypothetical exposure and do not model borrow costs. Coinbase candles have no bid/ask spread; set fees and slippage to approximate trading costs. Historical buckets can be missing when no trades occurred. The portfolio view compares independent runs, not a combined account.

## Custom indicators and rules

Version 2 strategies can define up to 16 named indicators from current or past OHLCV bars. Formula nodes support price/volume sources, constants, references to other named indicators, arithmetic, `min`, `max`, `abs`, `negate`, cumulative sum, lag, SMA, EMA, RSI, highest, lowest, standard deviation, and ATR. Periods are bounded and future-bar references are rejected. Gemini receives the same grammar and its output is validated by the backtest engine.

For example, a one-bar momentum indicator is:

```json
{"name":"Momentum","formula":{"op":"subtract","left":{"op":"source","field":"close"},"right":{"op":"lag","input":{"op":"source","field":"close"},"period":1}}}
```

Use it in a rule as `{"left":{"kind":"custom","name":"Momentum"},"op":"crosses_above","right":0}`. A flat rule array combines conditions with AND. An array of rule arrays combines its groups with OR, for example `[[ruleA, ruleB], [ruleC]]` means `(A AND B) OR C`. Signals use completed bars and fill at the next bar open. Strategies cannot access external datasets or run arbitrary Pine Script or JavaScript.

## Gemini setup

Set `GEMINI_API_KEY` in the `testify` Vercel project's Production environment variables and redeploy. Never put the key in a `VITE_` variable or browser code. Testify uses Gemini 3.8 Flash with 3.7 and 3.6 Flash fallbacks.

## Develop and deploy

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npx.cmd vercel --prod
```

There is no server database. Browser data can be lost if site storage is cleared; use Export backup.
