# Testify verification — 14 October 2026

The current interface follows the approved neutral Penpot workspace. Older blue/orange Figma references in Notion have been superseded by Adam's later design instructions.

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
- Vercel previously rejected deployments because Git author `ravenus123` lacks access to the Testify project. The project owner must grant access or deploy the reviewed commit through an authorized account. Do not change commit authors or disable deployment checks to bypass this.
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
- Notion's affected frontend tasks now describe this amended scope. Historical manual-mode checks remain identified as historical; external developer review and deployed staging verification remain open.
