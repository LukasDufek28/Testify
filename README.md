# Testify

Testify is an online crypto strategy research service deployed on Vercel. Trading research data stays in the browser. A small PostgreSQL database stores custom email/password accounts, sessions, abuse-prevention counters and user-owned strategies with revision history. See [account setup](docs/AUTH.md).

## Research flow

1. Choose a Coinbase Exchange USD or USDT spot market, candle interval, and historical period. Public market data loads in manageable chunks, with no Testify candle-count cap. Manual loads report expected and received candles, missing count and percentage, coverage, gap count and longest gap across the entire requested period. Candle slots use UTC interval boundaries and an exclusive end. Missing candles are never fabricated.
2. Write a JSON strategy or ask Gemini to draft one. Version 2 supports original indicators built from formula trees; existing version 1 strategies still work. The site owner's shared `GEMINI_API_KEY` stays in Vercel; visitors need no key. To revise a saved strategy, use Modify existing strategy in Strategy Studio. Development backtests are optional context. Gemini receives the current strategy JSON and compact development results, including fees and trade counts; the revision remains an unsaved draft until reviewed.
3. Set the full date range and development share, then backtest one or more markets sequentially. A 70% share runs only the first 70% of the selected **time range**; the later 30% is not downloaded by Backtests. Each result stores the original full range, split boundary, strategy snapshot, and cost settings in browser History. A failed market does not stop the remaining markets. Vercel retrieves candles in batches; the engine runs in a cancellable browser worker. Signals are evaluated at bar close and fill no earlier than the next bar open.
4. Review saved results on History and Portfolio lab. The combined view adds each selected run's percentage return against one reference capital: a -10% run and a +15% run display +5%. This assumes full starting capital for every run, so exposure rises with the number of selected runs.
5. In Validation, select compatible development runs. Testify uses each saved strategy version and cost setting on its reserved later period, then combines the holdout results into a portfolio. Validation results can be exported; they are not supplied to Gemini. Runs created before this split workflow cannot be validated as untouched holdouts. Strategies synchronize through the account database; chosen datasets and development results remain in each browser with IndexedDB. Export a backup to move them to another device.

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

Candles and backtest results are not stored in the account database. Browser data can be lost if site storage is cleared; use Export backup.

## Combined development branch

`dev` combines `devAdam` (including the approved local Penpot frontend) with `devLukas`.
The landing page is public; `#/app/*` requires the existing account/session flow.
Strategies use the account API and revision checks. Candles, runs, and tester options
remain isolated per user in browser storage. Connections, cloud history and script
strategies use the backend implementations from `devLukas`.

```powershell
git fetch origin
git switch --track origin/dev
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

For an existing local `dev` checkout, use `git switch dev` and `git pull --ff-only origin dev`.
Preserve uncommitted work before switching branches.

Follow [account configuration](docs/AUTH.md) for `DATABASE_URL`, `AUTH_SECRET`,
and schema initialization. Set `APP_ORIGINS` to your exact local or deployed URL
(for the command above: `http://127.0.0.1:4173`). Keep secrets in `.env.local`,
never in browser variables. AI additionally needs the existing server-side Gemini key.
The separately deployed MCP service is described in [MCP setup](docs/mcp-setup.md).

Run `npm run check` for build, server/engine tests and browser tests.
Browser regression tests mock the authenticated API contract; server ownership,
session, revision, OAuth and execution tests run against isolated PGlite databases.
Use `PLAYWRIGHT_PORT` to test on another port without connecting to a running checkout.
