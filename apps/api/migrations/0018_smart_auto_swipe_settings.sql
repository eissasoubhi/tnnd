BEGIN;

-- Persist scheduling preferences only. No Tinder automation is enabled by this table.
CREATE TABLE IF NOT EXISTS user_smart_auto_swipe_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version)
VALUES ('0018_smart_auto_swipe_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
