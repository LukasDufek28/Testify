# Programmable strategies (version 3)

Testify's web backtester accepts JavaScript strategy logic in a QuickJS WebAssembly runtime. Existing version 1/2 JSON rules still work. The desktop Rust engine is not used by this website. Python packages and native Rust compilation are not provided.

The strategy JSON contains `version: 3`, `runtime: "javascript"`, `name`, `description`, `parameters` (optional finite number/string/boolean values), and `code`. Define a synchronous `function onBar(ctx)` in code. Top-level variables persist for one run; every new run starts with fresh state. Use parameters for research variations without rewriting code.

## Context

- `bar`: the candle that just completed (`time` in UTC seconds at its open, `open`, `high`, `low`, `close`, `volume`).
- `index`: zero-based index in the selected trading window.
- `history`: read-only completed candles, including `bar`. Its length is always `index + 1`. No future or reserved holdout candles are loaded into the runtime.
- `symbol`, `equity`: market and current marked equity after this candle's fills, fees, and supplied funding.
- `parameters`: the strategy's parameters, read-only.
- `position`: null, or a read-only snapshot with `side` (long/short), `entry` (actual fill including slippage), `entryTime`, `units`, `stopPrice`, `takeProfitPrice`, `initialRisk` (original monetary stop risk), `highestHigh`, `lowestLow`, `barsHeld`. Extrema include entry-bar prices; OHLC cannot tell which occurred before an intrabar entry. This is disclosed and conservative stop-first assumptions apply.

Use incremental calculations for long histories. Loops, arrays, functions and persistent state support custom indicators, confirmed pivots, market structure, fair value gaps, liquidity sweeps, order blocks, sessions and aggregated higher timeframes. A pivot requiring later bars is recognized only after those bars complete. Only use a higher timeframe candle after all its constituent candles complete. Strategy authors remain responsible for their definitions: runtime checks do not prove a trading idea correct.

## Decisions

Return `{}` (or undefined) for no action. Other supported fields:

- `entry: { side, type?, price?, stopDistance?, stopPrice?, takeProfitPrice?, riskPct?, allocationPct?, expiresAfterBars? }`.
  - `type` is market (default), limit or stop. Limit/stop require `price` and remain working until filled, canceled, replaced, or expired.
  - `stopDistance` places the initial stop relative to the actual fill. Alternatively supply an absolute `stopPrice`.
  - `riskPct` sizes units as equity × riskPct / 100 / initial stop distance; costs are charged separately, so net loss can exceed this price-risk budget. Requires an initial stop.
  - `allocationPct` defaults to 100 and caps notional; entry commission is reserved so the cap cannot consume more than available equity. Only one position per market, without leverage or pyramiding.
  - Wrong-sided stops or targets after a gap skip that entry and add a warning.
- `exit: true`: exit at next candle open. `exitPct` in (0,100] instead closes that percentage. Partial exits are recorded as separate trade legs; metrics use those legs.
- `stopPrice`: new absolute protective stop for an existing position. Only tightens (higher for long, lower for short).
- `takeProfitPrice`: new target for an existing position. Omit targets for no fixed take profit.
- `cancelEntry: true`: cancel a pending entry. A new entry replaces an older unfilled order.

Signals are calculated only at candle close. New orders, cancellations, exits and protective updates apply from the next candle. Initial stops are active on the entry candle. Market fills use the next open; stop-entry gaps use the worse open, limit-entry gaps use the better open and cannot fill beyond the limit. Stops across gaps fill at the worse open. Stop and target conflicts use the stop first. Slippage is adverse. Prices do not include a bid/ask spread.

## Funding and results

Dataset `funding` may contain `{ time, rate, markPrice? }` events aligned to candle opens. Positive rates charge longs and credit shorts held before that open. Rates are decimal fractions. Missing funding produces an explicit warning; fees are never invented. Import finer candles for funding events between candle opens. Historical funding is not currently downloaded by the Coinbase data API.

Results include fees, supplied funding, profit factor and average R multiple when defined. No losing trades makes profit factor undefined (null). No initial stop makes R undefined. Sharpe uses daily returns and 365 days for crypto; legacy rule runs retain their existing calculation. Date selection/validation is still controlled by the research workflow, not by strategy code.

## Execution boundary

No network, browser DOM, credentials, filesystem, Node APIs or packages are exposed. Each run has an isolated VM. Infinite loops and excessive allocation fail with an error (64 MB memory, interrupt/time budgets). The browser worker can be canceled. These limits govern resource use, not candle count. Syntax and short synthetic scenarios are checked before Gemini returns a draft. These are execution checks, not profitability tests or proof that every branch is safe or valid.
