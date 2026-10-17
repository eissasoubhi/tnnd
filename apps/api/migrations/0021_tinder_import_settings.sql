BEGIN;
CREATE TABLE IF NOT EXISTS tinder_import_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('0021_tinder_import_settings') ON CONFLICT (version) DO NOTHING;
COMMIT;
