CREATE TABLE IF NOT EXISTS testify_accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS testify_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS testify_sessions_expiry ON testify_sessions(expires_at);
CREATE TABLE IF NOT EXISTS testify_auth_limits (
  key text PRIMARY KEY,
  bucket bigint NOT NULL,
  count integer NOT NULL
);
CREATE TABLE IF NOT EXISTS testify_strategies (
  user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  source text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS testify_strategy_versions (
  user_id uuid NOT NULL,
  strategy_id text NOT NULL,
  revision integer NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, strategy_id, revision),
  FOREIGN KEY (user_id, strategy_id) REFERENCES testify_strategies(user_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS testify_workspace_records (
  user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  id text NOT NULL,
  payload jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, id)
);
CREATE TABLE IF NOT EXISTS testify_mcp_mutations (
  user_id uuid NOT NULL REFERENCES testify_accounts(id) ON DELETE CASCADE,
  key text NOT NULL,
  fingerprint text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
-- Periodic authentication maintenance.
-- DELETE FROM testify_sessions WHERE expires_at < now();
-- DELETE FROM testify_auth_limits WHERE bucket < floor(extract(epoch FROM now()) / 60) - 1440;
