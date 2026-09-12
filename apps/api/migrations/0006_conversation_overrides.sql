BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_config_overrides_object;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_config_overrides_object
  CHECK (jsonb_typeof(config_overrides) = 'object');

INSERT INTO schema_migrations(version)
VALUES ('0006_conversation_overrides')
ON CONFLICT (version) DO NOTHING;

COMMIT;
