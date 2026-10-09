# Testify MCP connection

This server lets ChatGPT or Codex operate your Testify account. Inference runs in the connected host under that user's subscription and limits. The server does not embed GPT into the website or share the owner's subscription with other users.

## Local setup

1. Install the website dependencies, then run `npm --prefix apps/mcp install`.
2. Keep the existing account environment in the root `.env.local`. Initialize the additive schema with `node --env-file=.env.local scripts/init-mcp-db.mjs`.
3. Create `apps/mcp/.env.local` with `DATABASE_URL`, `AUTH_SECRET` (same account database/configuration), `MCP_PUBLIC_URL=http://localhost:3001`, and `TESTIFY_SITE_URL=http://127.0.0.1:5174`. Alternatively, `node scripts/dev-mcp.mjs` loads the existing root environment safely.
4. Start the existing website API development server and `npm --prefix apps/mcp run dev`.
5. Point MCP Inspector or a locally running Codex MCP client at `http://localhost:3001/api/mcp`. Complete OAuth in Testify; real account login is required. Guest preview browsing remains unchanged. The ChatGPT Server URL field requires a public HTTPS address; use Secure MCP Tunnel for a private local server.

Authorization uses registered exact redirect URIs and PKCE S256. Public clients register at `/oauth/register`, discover `/.well-known/oauth-authorization-server`, and request the resource `<MCP_PUBLIC_URL>/api/mcp`. Access tokens last 15 minutes; refresh tokens rotate and last 30 days. Both token types are stored as hashes. Token and consent credentials must never be committed or printed.

## Vercel preview and production

Publishing requires the owner's explicit authorization.

1. Create a Vercel project named **testify-mcp**, connected to this repository, with root directory `apps/mcp` and the Next.js framework. Enable access to files outside the root directory for shared engine/service imports. Install the root package and backend package before the build. Build command: `npm run build` from `apps/mcp`.
2. For preview, use an isolated Neon branch with the existing account schema plus `mcp-schema.sql`. The website preview and backend preview must use that same branch. Never point preview jobs at production accounts.
3. Configure `DATABASE_URL`, `AUTH_SECRET`, `MCP_PUBLIC_URL` (a stable HTTPS backend URL), and `TESTIFY_SITE_URL` (the matching website URL). Set `MCP_PUBLIC_URL` on the Vite website's server functions too, so consent returns the correct issuer.
4. Keep `MCP_JOBS_ENABLED=false` until Vercel Functions, Workflows, Queues and Neon allowances have been checked. This gate fails closed with a configuration message.
5. Set `MCP_MONTHLY_JOB_LIMIT`, `MCP_MONTHLY_PAGE_LIMIT`, `MCP_MONTHLY_EVENT_BUDGET`, and `MCP_TEMP_STORAGE_BYTES` below verified allowances. Initial defaults are 100 batches/month, 5,000 provider page attempts/month, 40,000 estimated workflow events/month, and 25 MB of temporary checkpoints. These admission budgets do not measure every Vercel billing resource; set platform spend controls and monitor the dashboard too. No code automatically upgrades a plan.
6. Set a random `CRON_SECRET` of at least 32 characters. The backend's Vercel configuration schedules authenticated `/api/maintenance` cleanup daily. The maintenance script also supports manual cleanup of expired checkpoints.
7. Connect ChatGPT/Codex to `<MCP_PUBLIC_URL>/api/mcp`, sign in, approve scopes, then run the acceptance workflow below. Vercel deployment protection must allow the MCP host to reach discovery, OAuth and MCP routes; application OAuth remains mandatory.
8. Promote only after preview acceptance. Keep existing Gemini available; this connection does not depend on its key.

## Acceptance workflow

Read workspace info → inspect strategy format → create and validate a strategy → save it → freeze its revision → submit BTC/ETH development batch → close Testify → poll job → inspect run summaries → request portfolio summary → save a revised strategy using development context only.

`research` defines `fullStart`, `boundary` (development end), and `fullEnd`. If a final untouched holdout is required, define `holdoutStart` during development. Validation ends before that value; holdout starts at or after it. Evaluation dates are never silently shortened. Warm-up is allowed before start but cannot place trades or contribute scored returns.

Use unique idempotency keys for mutations and reuse the same key when retrying the same operation. If an uncertain action stays pending, check activity/history rather than assigning a new key and duplicating it. Long jobs return an ID immediately. One batch per account runs at a time. Coinbase throttling waits at least a minute; persistent outages terminate the market after ten consecutive retries. Successful markets remain saved if another fails.

## Storage and limitations

- Strategies, OAuth credentials, jobs, exact run metrics, aggregates and daily equity samples are account scoped in Neon.
- Full trade logs and permanently cached candles are not uploaded. Existing local history is uploaded only through **Upload history summaries**.
- Background runs appear as **Summary only** in History. Cloud portfolio drawdown uses daily samples and is explicitly approximate. Full-resolution local runs preserve their existing charts.
- Temporary candle pages expire after 24 hours and are removed on completion. Workflow step inputs/outputs contain IDs and progress rather than candles or full trades.
- Submitted jobs continue with the browser closed. Further autonomous GPT reasoning still depends on the host conversation continuing.
- Deletions and holdout access require a server-recorded approval through **Connections**. Approvals expire after 30 minutes, are tied to the connection and target, and are single use.
- A deployment cannot provide infinite execution: custom code is sandboxed and resource bounded. Resource exhaustion produces an explicit failure, not altered dates or invented performance.

## Verification

Run `npm test`, `npm run build`, and `npm --prefix apps/mcp run build`. `tests/mcp.test.mjs` checks OAuth replay/expiry, account isolation, idempotency, approvals, research boundaries, retries, summaries, execution and warm-up. Deployment survival and real host OAuth must additionally be verified against the preview deployment.
