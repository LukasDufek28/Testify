# Testify verification — 14 October 2026

The current interface follows the approved neutral Penpot workspace. Older blue/orange Figma references in Notion have been superseded by Adam's later design instructions.

## Verified locally

- Real account sign-in, account menu and sign-out; server-side ownership and session boundaries.
- A real Gemini request created and explicitly saved `Demo crossover`; another request configured and ran it through the existing Backtests page. Its saved development result returned $349.28 net profit over 12 trades.
- A real two-child parameter batch completed and saved separate results. Automated browser coverage also forces one child to fail, refreshes, resumes only the missing child and checks that completed siblings are retained.
- Manual market/limit/stop orders, risk sizing, pending-order editing/cancellation, next-open fills, stop-first ambiguity and manual closure. A real position survived reload with the same cursor, units, equity and fees, then completed into History.
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

Automatic and batch calculations run in the browser worker. Closing the browser interrupts computation; saved job snapshots can resume remaining runs. Manual cursor and positions persist after every action.

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
