BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS sync_cursor text;

INSERT INTO schema_migrations(version)
VALUES ('0008_conversation_sync_cursor')
ON CONFLICT (version) DO NOTHING;

COMMIT;
