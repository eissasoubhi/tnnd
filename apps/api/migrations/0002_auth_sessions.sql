BEGIN;

ALTER TABLE extension_sessions
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS extension_sessions_token_hash_idx
  ON extension_sessions(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS extension_sessions_user_active_idx
  ON extension_sessions(user_id, revoked_at, expires_at);

INSERT INTO schema_migrations(version)
VALUES ('0002_auth_sessions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
