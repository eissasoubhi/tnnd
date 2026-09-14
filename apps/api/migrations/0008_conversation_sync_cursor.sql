BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS sync_cursor text,
  ADD COLUMN IF NOT EXISTS sync_cursor_updated_at timestamptz;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_sync_cursor_length_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_sync_cursor_length_check
  CHECK (sync_cursor IS NULL OR char_length(sync_cursor) <= 512);

INSERT INTO schema_migrations(version)
VALUES ('0008_conversation_sync_cursor')
ON CONFLICT (version) DO NOTHING;

COMMIT;
