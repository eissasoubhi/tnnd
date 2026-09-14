BEGIN;

CREATE TABLE IF NOT EXISTS match_profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source = 'tinder-visible-profile'),
  source_capture jsonb NOT NULL,
  normalized_profile jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (conversation_id IS NULL AND expires_at IS NOT NULL)
    OR (conversation_id IS NOT NULL AND expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_match_profiles_user_captured
  ON match_profiles(user_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_profiles_expiry
  ON match_profiles(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_profiles_conversation
  ON match_profiles(user_id, conversation_id)
  WHERE conversation_id IS NOT NULL;

INSERT INTO schema_migrations(version)
VALUES ('0009_match_profiles')
ON CONFLICT (version) DO NOTHING;

COMMIT;
