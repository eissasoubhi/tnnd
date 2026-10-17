BEGIN;
CREATE TABLE IF NOT EXISTS match_profile_photo_archives (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES match_profiles(id) ON DELETE CASCADE,
  source_hash text NOT NULL CHECK (length(source_hash) = 64),
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg','image/png','image/webp','image/gif')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 4194304),
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,profile_id,source_hash)
);
CREATE INDEX IF NOT EXISTS idx_match_profile_photo_archive_owner
  ON match_profile_photo_archives(user_id,profile_id);
INSERT INTO schema_migrations(version) VALUES ('0022_match_profile_photo_archives') ON CONFLICT (version) DO NOTHING;
COMMIT;
