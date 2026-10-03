# Testify accounts

Testify owns its email/password login. Only accounts, password hashes, revocable sessions and rate-limit counters are stored in PostgreSQL. Candles, strategies, runs and preferences remain in each browser, partitioned by the account's UUID. Browser storage is not a security boundary against someone with access to the same browser profile or developer tools. Accounts do not synchronize trading data between devices.

## Connected databases

The Vercel `testify` project now has two Neon Free resources: `testify-accounts` for Production and `testify-accounts-dev` for Preview and Development. Both have the account schema. `DATABASE_URL`, `AUTH_SECRET` and `APP_ORIGINS` are configured in Vercel; local `.env.local` uses the development database. Production and development use different auth secrets.

For a fresh clone, link to the same Vercel project and run `vercel env pull .env.local --environment development --yes`. Keep that file out of Git. `npm run db:init` applies the account schema idempotently to the local environment's database. Start the full app with `vercel dev` so the APIs are served as well.

## Set up another Vercel project

1. Create a Neon PostgreSQL database, or connect a Neon database through the Testify Vercel project's Storage page. Select a plan appropriate to your usage; no paid plan is required by the code.
2. Run `auth-schema.sql` in the database SQL editor.
3. Set these server environment variables for Preview and Production separately:
   - `DATABASE_URL`: the Neon PostgreSQL connection string. Never prefix it with `VITE_`.
   - `AUTH_SECRET`: a random secret of at least 32 characters. Generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never commit it.
   - `APP_ORIGINS`: comma-separated, exact website origins, for example `https://testifybacktester.vercel.app`. Vercel's current deployment URL is also allowed automatically. Add any custom domain you actually use.
4. Redeploy `devLukas` to Preview. Check account creation, sign-in, sign-out, market loading and Gemini before merging into `main`.
5. Keep `GEMINI_API_KEY` configured as before.

For local use, put those variables in a gitignored `.env.local` and run Vercel development so `/api` functions are served too. Plain Vite alone does not serve the account API.

## API contract

`GET /api/auth` returns `{ user: null }` or `{ user: { id, email, sessionId } }`.

`POST /api/auth` accepts JSON:

- `{ action: "register", email, password }`
- `{ action: "login", email, password }`
- `{ action: "logout" }`

Registration and login set an opaque HttpOnly cookie and return the user above. Logout revokes that exact session and clears its cookie. Session lifetime is seven days. Passwords require 12–128 characters and are stored as salted scrypt hashes. Email comparison is case-insensitive. This release does not include email verification or password reset; do not present either feature in the frontend.

All four research APIs (`markets`, `candles`, `backtest`, `generate-strategy`) require that session cookie. Requests from the app also send `X-Testify-Session` with the current session ID, preventing an old tab from acting under an account signed in elsewhere in the same browser. This ID is not a credential. Only the opaque cookie authenticates a request.

Mutating requests must send an allowed `Origin`. Responses contain no session token, password hash or database details. Protected responses are private and not cached by the CDN. Auth errors use 401, invalid input 400, origin violations 403, and unconfigured or unavailable account services 503.

Limits are enforced atomically in PostgreSQL across server instances. Per user per minute: Gemini 5, candle requests 90, market lists 30, server backtests 10. Login and registration also have IP and email limits. A 429 response includes `Retry-After: 60`. Coinbase's and Google's shared upstream quotas still apply; the existing candle retry flow waits and continues. These limits do not cap the total candle count of a browser backtest.

## Existing browser data

The previous `testify-local-v1` workspace is preserved but is not assigned automatically to an account because its owner cannot be verified. Before upgrading production, export a backup from the current site. After signing in, restore it to your account through Overview → Restore backup. Existing unscoped settings are likewise not assigned to a new account.

## Maintenance

Expired sessions and old rate counters are removed after successful login/registration. The SQL file includes optional maintenance commands. Keep database backups and access credentials under the site owner's control. The connected databases were provisioned and their schemas verified. Registration and session checks were tested against the live development database. The auth code remains on `devLukas`; merging into `main` is a separate production release.
