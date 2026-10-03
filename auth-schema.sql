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
-- Periodic maintenance; no trading data is stored in these tables.
-- DELETE FROM testify_sessions WHERE expires_at < now();
-- DELETE FROM testify_auth_limits WHERE bucket < floor(extract(epoch FROM now()) / 60) - 1440;
