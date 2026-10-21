# Testify

Testify is an online crypto strategy research service deployed on Vercel. A PostgreSQL database stores accounts, sessions, user-owned strategy versions, historical datasets, immutable backtest results, run progress, replay state and saved defaults. IndexedDB keeps an account-scoped browser mirror. See [account setup](docs/AUTH.md).

## Research flow

1. Choose a Coinbase Exchange USD or USDT spot market, candle interval, and historical period. Public market data loads in manageable chunks, with up to 20,000 candles per saved dataset. Manual loads report expected and received candles, missing count and percentage, coverage, gap count and longest gap across the entire requested period. Candle slots use UTC interval boundaries and an exclusive end. Missing candles are never fabricated.
2. Write a JSON strategy or ask Gemini to draft one. Version 2 supports original indicators built from formula trees; existing version 1 strategies still work. The site owner's shared `GEMINI_API_KEY` stays in Vercel; visitors need no key. To revise a saved strategy, use Modify existing strategy in Strategy Studio. Development backtests are optional context. Gemini receives the current strategy JSON and compact development results, including fees and trade counts; the revision remains an unsaved draft until reviewed.
3. Set the full date range and development share, then backtest one or more markets sequentially. A 70% share runs only the first 70% of the selected **time range**; the later 30% is not downloaded by Backtests. Each result stores the original full range, split boundary, strategy snapshot, and cost settings in account History. A failed market does not stop the remaining markets. Vercel retrieves candles in batches; the engine runs in a cancellable browser worker. Signals are evaluated at bar close and fill no earlier than the next bar open.
4. Review saved results on History and Portfolio lab. The combined view adds each selected run's percentage return against one reference capital: a -10% run and a +15% run display +5%. This assumes full starting capital for every run, so exposure rises with the number of selected runs.
5. In Validation, select compatible development runs. Testify uses each saved strategy version and cost setting on its reserved later period, then combines the holdout results into a portfolio. Validation results can be exported; they are not supplied to Gemini. Runs created before this split workflow cannot be validated as untouched holdouts. Strategies, datasets, results and defaults synchronize through the account database. Export a backup for an additional portable copy.

The research engine models one spot pair and one position per run. It does not place orders. Short trades are hypothetical exposure and do not model borrow costs. Coinbase candles have no bid/ask spread; an entered spread is applied as half the spread on each fill, in addition to fees and slippage. Risk overrides use the saved stop distance and are capped at available capital. Fixed commission is charged half on entry and half on exit. Historical buckets can be missing when no trades occurred. The portfolio view compares independent runs, not a combined account.

## Custom indicators and rules

Version 2 strategies can define up to 16 named indicators from current or past OHLCV bars. Formula nodes support price/volume sources, constants, references to other named indicators, arithmetic, `min`, `max`, `abs`, `negate`, cumulative sum, lag, SMA, EMA, RSI, highest, lowest, standard deviation, and ATR. Periods are bounded and future-bar references are rejected. Gemini receives the same grammar and its output is validated by the backtest engine.

For example, a one-bar momentum indicator is:

```json
{"name":"Momentum","formula":{"op":"subtract","left":{"op":"source","field":"close"},"right":{"op":"lag","input":{"op":"source","field":"close"},"period":1}}}
```

Use it in a rule as `{"left":{"kind":"custom","name":"Momentum"},"op":"crosses_above","right":0}`. A flat rule array combines conditions with AND. An array of rule arrays combines its groups with OR, for example `[[ruleA, ruleB], [ruleC]]` means `(A AND B) OR C`. Signals use completed bars and fill at the next bar open. Formula strategies cannot access external datasets or execute code. Version 3 supports restricted JavaScript inside the isolated QuickJS runtime; arbitrary host APIs and direct Pine Script execution are unavailable.

## Gemini setup

Set `GEMINI_API_KEY` in the `testify` Vercel project's Production environment variables and redeploy. Never put the key in a `VITE_` variable or browser code. The workspace assistant defaults to `gemini-3.6-flash` with a bounded `gemini-3.5-flash-lite` fallback. Strategy generation separately tries its supported 3.8, 3.7, 3.6, 3.5, Flash-Lite and 2.5 models. The optional server-only `GEMINI_MODEL` puts a configured model first; local testing currently uses explicit `gemini-3.6-flash`.

For local frontend review, `.env.local` can enable `TESTIFY_LOCAL_DEMO=1` with an `AUTH_SECRET` of at least 32 characters and an `APP_ORIGINS` entry matching the local URL. This uses a persistent PostgreSQL database under the ignored `.local/testify-demo` directory and creates `demo@testify.local` / `Testify-Demo-2026!`. The local database adapter is disabled on Vercel and production builds.

## Develop and deploy

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npx.cmd vercel --prod
```

Run `npm run db:init` after upgrading to apply the account and workspace schema. Existing account-scoped browser datasets/results migrate once into the database. Keep using Export backup as an additional copy.

## Combined development branch

`dev` combines `devAdam` (including the approved local Penpot frontend) with `devLukas`.
The landing page is public; `#/app/*` requires the existing account/session flow.
Strategies use the account API and revision checks. Candles, runs, replay positions and saved defaults use the authenticated workspace API; current unsaved tester options remain account-scoped in browser storage. Connections, cloud history and script
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

## Assistant, backtests and batches

The small assistant is available across workspace pages. It can read selected strategies and development results, update requested settings, prepare strategy drafts, save a new strategy only when explicitly asked, and run the existing backtest flow. Revisions require review and Save. Gemini uses server-only credentials through the AI SDK; the popup contains conversation and short activity text, while calculations stay on the Backtests page.

Completed automatic tests and saved runs open in the existing Backtests Overview. Additional measured statistics, immutable settings, strategy snapshots and exports are available in Run details & exports. Trades & chart inspects saved entries, exits, stops and targets with original candles, filters and pagination. The separate Manual replay frontend was retired at Adam's request; its execution engine, persistence API and regression tests remain for compatibility.

Run settings includes saved defaults and parameter/period batches. Batches contain up to 24 children and execute sequentially in the browser worker. Each child has independent settings and a strategy snapshot. Failures preserve completed siblings. Leaving the browser interrupts automatic calculation; reopen Run settings and Resume remaining runs to continue without duplicating completed results.
