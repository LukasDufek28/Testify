CREATE TABLE IF NOT EXISTS testify_mcp_clients (
 id text PRIMARY KEY, name text NOT NULL, redirect_uris jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS testify_mcp_grants (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
 client_id text NOT NULL REFERENCES testify_mcp_clients(id), scopes text NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS testify_mcp_codes (
 hash text PRIMARY KEY, grant_id uuid NOT NULL REFERENCES testify_mcp_grants(id) ON DELETE CASCADE,
 redirect_uri text NOT NULL, challenge text NOT NULL, resource text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS testify_mcp_tokens (
 hash text PRIMARY KEY, grant_id uuid NOT NULL REFERENCES testify_mcp_grants(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('access','refresh')), resource text NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS testify_mcp_requests (
 id uuid PRIMARY KEY, params jsonb NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE IF NOT EXISTS testify_mcp_mutations (
 user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE, key text NOT NULL,
 fingerprint text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,key)
);
CREATE TABLE IF NOT EXISTS testify_mcp_jobs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
 grant_id uuid REFERENCES testify_mcp_grants(id), status text NOT NULL DEFAULT 'queued',
 config jsonb NOT NULL, progress jsonb NOT NULL DEFAULT '{}', errors jsonb NOT NULL DEFAULT '[]',
 workflow_id text, cancel_requested boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS testify_mcp_active_job ON testify_mcp_jobs(user_id)
 WHERE status IN ('queued','loading','running','waiting_retry');
CREATE TABLE IF NOT EXISTS testify_run_summaries (
 user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE, id text NOT NULL,
 job_id uuid REFERENCES testify_mcp_jobs(id) ON DELETE SET NULL, payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS testify_mcp_portfolios (
 user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE, id uuid NOT NULL,
 name text NOT NULL, run_ids jsonb NOT NULL, PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS testify_mcp_approvals (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
 grant_id uuid NOT NULL REFERENCES testify_mcp_grants(id), action text NOT NULL, target_id text NOT NULL,
 approved_at timestamptz, consumed_at timestamptz, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS testify_mcp_events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
 grant_id uuid REFERENCES testify_mcp_grants(id), action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS testify_mcp_pages (
 job_id uuid NOT NULL REFERENCES testify_mcp_jobs(id) ON DELETE CASCADE, market text NOT NULL,
 cursor bigint NOT NULL, payload jsonb NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(job_id,market,cursor)
);
CREATE TABLE IF NOT EXISTS testify_mcp_budgets (
 key text PRIMARY KEY, value bigint NOT NULL DEFAULT 0
);
ALTER TABLE testify_mcp_jobs ADD COLUMN IF NOT EXISTS progress_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE testify_mcp_jobs ADD COLUMN IF NOT EXISTS execution_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS testify_candle_cache (
 market text NOT NULL, interval_seconds integer NOT NULL, bucket bigint NOT NULL,
 payload text NOT NULL, complete boolean NOT NULL, expires_at timestamptz NOT NULL,
 accessed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(market,interval_seconds,bucket)
);
CREATE INDEX IF NOT EXISTS testify_candle_cache_expiry ON testify_candle_cache(expires_at);
CREATE TABLE IF NOT EXISTS testify_candle_leases (
 market text NOT NULL, interval_seconds integer NOT NULL, bucket bigint NOT NULL,
 owner text NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(market,interval_seconds,bucket)
);
