# Testify verification — updated 23 October 2026

The current interface follows the approved neutral Penpot workspace. Older blue/orange Figma references in Notion have been superseded by Adam's later design instructions.

## Current revision — 23 October 2026

- Run backtest is the single configuration screen at the existing runsettings route. Overview contains measured results and a link to configure a test. Studio, library and saved-setting reuse lead to the same form. The primary Run action and actual progress are near the heading.
- Library cards remain bounded rather than expanding across a smaller window. Header actions reflow against the available content width. Market checkboxes, nested/document scrollbars, selectors, secondary pages and chart colors share the approved neutral/purple/mint/rose palette.
- Daily Sharpe is calculated consistently from saved equity where possible. Short samples are labeled, and insufficient, sparse, nonpositive or constant data does not produce an invented number. Original stored snapshots are retained.
- Assistant retries resume from completed tool results. Stop cancels a waiting answer or skips queued actions after the active action completes. Follow-ups keep action results; duplicate context snapshots are removed from transport history. Online/CSV selection is an explicit supported setting. The old secondary conversation in Research tools is removed.
- Display timezone changes update the workspace immediately and survive reload. Untouched batch periods follow the main setup; explicitly edited periods are retained. Partial batches resume without duplicating completed children.
- Workspace backup download and validated restore are available from Data. Restore checks the whole file and conflicts before writing, preserves existing versions, and uses fresh strategy revisions in a new account.
- Real local Gemini configured and executed `QA polish October 23`: $8,000 capital, 3 bps percentage fees, 2 bps slippage, three development trades, $133.23 net profit and measured bounds 2026-09-30T22:00:00Z to 2026-10-10T17:12:00Z. The displayed Sharpe estimate was 5.01 from ten daily returns. This verifies execution and reporting, not a strategy's investment merit.
- Final commit checks and deployed-preview acceptance evidence are recorded in the linked Notion integration/release tasks. Physical mobile hardware and review by the other developer are separate requirements.

## Verified locally

- Real account sign-in, account menu and sign-out; server-side ownership and session boundaries.
- A real Gemini request created and explicitly saved `Demo crossover`; another request configured and ran it through the existing Backtests page. Its saved development result returned $349.28 net profit over 12 trades.
- A real two-child parameter batch completed and saved separate results. Automated browser coverage also forces one child to fail, refreshes, resumes only the missing child and checks that completed siblings are retained.
- Historical manual-mode verification covered market/limit/stop orders, risk sizing, pending-order editing/cancellation, next-open fills, stop-first ambiguity and manual closure. Adam subsequently removed this separate frontend from the product; the engine/API and their regression coverage remain.
- Account-scoped datasets, immutable results, replay state, run jobs and defaults persist in PostgreSQL. Existing account-scoped browser data migrates once; browser storage remains a mirror.
- Strategy import, validation, create, duplicate, versioned save, editable Gemini revision/diff, undo, deletion, history, trade inspection, comparison and CSV/JSON exports.
- Capital, percentage/fixed fees, risk overrides, spread and slippage reach the engine and remain in saved snapshots. Timezone changes affect presentation; timestamps and UTC CSV exports remain unchanged.
- Compact global assistant, persistent conversation, retry, expansion and short activity text. The backtest runner stays on Backtests.
- Responsive screens from 320px to ultrawide. On a real 3440px viewport the main content remained 1142px wide, centered in the area beside the 230px sidebar.

## Release requirements still external

- Review by the other developer and verification on the actual Vercel staging deployment remain unchecked in Notion.
- Vercel author-access errors were observed earlier. On 23 October, GitHub reported successful Testify and MCP preview deployments for `cf3fe85`; the Testify preview returned the application and its account endpoint successfully. Verify the final revision's preview separately before claiming staging acceptance. Do not change commit authors or disable checks to bypass a future failure.
- Apply `npm run db:init` to the deployment database and retain its server-only Gemini key. Local `.env.local` credentials and the demo database are ignored by Git.
- Browser automation covers Chromium and core journeys in Firefox, WebKit and touch-device emulation. Physical mobile devices have not been certified.

Automatic and batch calculations run in the browser worker. Closing the browser interrupts computation; saved job snapshots can resume remaining runs. The retained manual backend persists cursor and positions after every action, but has no separate page in the current frontend.

No live orders are placed by this research application.

## UI revision — 16 October 2026

- Adam requested one shared floating assistant. Duplicate dashboard, library and editor AI panels were removed. The editor remains full width, with a shortcut into the shared conversation.
- The popup uses a restrained Motion spring and an anchored expansion beside the sidebar, inspired by Motion's public Clerk User Button example. Its content fades in without scaling the text. The launcher disappears while the popup is open and returns when it closes. Conversation, resizing, dragging, short activity messages and reduced-motion support remain available.
- Assistant replies render paragraphs, emphasis, lists, links and code without visible speaker prefixes. User messages remain plain text in neutral bubbles. Raw HTML and images are not rendered; links use the Markdown renderer's protocol filtering.
- Dashboard metrics form one row; the equity chart and latest run share a row. Monthly returns and Continue working share their top edge and height, with the monthly title aligned to the other card title.
- Real local Gemini created and saved a strategy and ran its backtest through the site. The saved result was $243.31 net profit over nine development trades. A later temporary provider failure appeared as a recoverable error without changing the saved result.
- Core journey verification now has a separate cross-browser configuration and GitHub jobs for Firefox, WebKit, Android Chrome emulation and iPhone Safari emulation. Run with `npx playwright test --config=playwright.cross-browser.config.ts`. Physical-device certification and actual Vercel staging verification remain separate release requirements.
- Cross-browser checks exposed pointer conversion before chart initialization and a mobile navigation layer beneath the chat. Chart interaction now waits for the configured instance, and an opened mobile menu stays above the assistant. Both affected journeys passed locally in desktop WebKit and both touch projects.
- The document canvas now uses the approved background through html, body and root, with no fixed minimum document width. Nine responsive-shell journeys resize each screen repeatedly between 320px and 3440px and verify both the canvas and the centered content. These passed in Chromium and desktop/touch WebKit. Adam's report of a frozen canvas while manually resizing his Chrome window remains open for direct reproduction; on his request, further investigation is deferred.
- Assistant generation now uses a bounded second supported Gemini model after overload, quota, timeout or a retired-model response. Each attempt is limited to 20 seconds, and requested site mutations are returned only after a successful response. Invalid requests and authentication failures do not trigger model retries. Five provider regressions and the full 89-test engine/API suite passed. A real provider timeout recovered to the fallback model, and the live chat subsequently returned a formatted Slovak summary of the saved development run.

## Backtest consolidation — 21 October 2026

- Automatic completion and opening a saved run now use the existing Penpot Backtests → Overview. The duplicate Backtest results screen has been removed. Old result links redirect to the existing Overview.
- Secondary measured statistics, immutable settings, original rules, monthly history, comparison and CSV/JSON exports remain available in a collapsed Run details & exports section below the original chart and Trades summary.
- Manual replay is removed from navigation; old manual links open Trades & chart. The existing trade review retains original candles, entry/exit/SL/TP markers, direction/exit filters, pagination, CSV export and playback. Manual backend calculations and API tests are retained.
- One-, two- and three-month returns use bounded bars centered inside the original card; seven months retain the regular layout. Regression coverage checks 390px, 1440px and 2560px viewports.
- Equity-axis precision follows the visible range, so small measured moves around $10,000 have distinct labels. The left gutter adapts to their width, including on phones.
- The assistant receives explicit ISO tested-period bounds from each saved development run, separate from the full requested research range. Reserved holdout results are not included in its context.
- The default assistant model is explicitly `gemini-3.6-flash`, with `gemini-3.5-flash-lite` as its distinct bounded fallback. Local configuration uses the same explicit primary model; a live read-context request returned an answer after the older alias timed out. Deployment owners can select a model through the server-only `GEMINI_MODEL` setting.
- Notion's affected frontend tasks now describe this amended scope. Historical manual-mode checks remain identified as historical; external developer review and deployed staging verification remain open.
- Trade snapshots now retain the stop and target active at exit, including programmable strategies and trailing stops. Trade details, chart levels and CSV exports use these measured values; chart bounds include the selected levels. Older rule-based results retain their deterministic fixed-percentage fallback. Older programmable results without saved levels explicitly show that those values were not stored; their immutable snapshots are not rewritten.

## Functional workspace audit — 21 October 2026

- Workspace search now opens the strategy library with the actual query applied. Clearing it restores the full library. Market, dataset, timeframe and library filters use the same dark popup controls; market search, enabled-option keyboard navigation, empty results and Escape are covered. Both simple and advanced forms include the supported 30-minute and 4-hour intervals.
- Trade details and history preserve price precision for small assets and cents for larger markets. Trade P/L includes cents, measured SL/TP use the same price formatting, and CSV retains the original numeric values. Small price axes use readable scientific notation where necessary; end labels stay inside the candle chart.
- The assistant's bounded context always includes an eligible selected result, including one older than the newest five runs. Reserved validation results remain excluded.
- Dashboard greetings follow the signed-in account instead of always showing Adam. Expanded result details no longer stretch the left run form and push its controls far down the page.
- Motion reveals equity/drawdown curves and monthly bars when they enter view. Hover and resizing retain the drawn curve. Loaded libraries and lazy editors receive a short scoped entrance; reduced motion presents the final state immediately. Existing Penpot surfaces and gradients are retained.
- A separate local QA account registered successfully, validated and saved a strategy. A real Gemini conversation applied $7,500 capital, 3 bps fees and 2 bps slippage, then ran the saved strategy on historical BTC candles. The saved development result was $124.91 over three trades. Reload retained the result and original settings; trade review restored candles and measured risk levels, and the downloaded CSV contained all three trades. The existing demo workspace was not used for these mutations.
- Review by the other developer, actual Vercel staging and the previously deferred manual Chrome-window resize report remain separate open checks.
