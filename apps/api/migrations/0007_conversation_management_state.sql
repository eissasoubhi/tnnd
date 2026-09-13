BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS management_state text NOT NULL DEFAULT 'unmanaged',
  ADD COLUMN IF NOT EXISTS management_selected_at timestamptz;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_management_state_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_management_state_check
  CHECK (management_state IN ('unmanaged', 'ai-managed', 'manual', 'moved-off-tinder', 'archived'));

CREATE INDEX IF NOT EXISTS idx_conversations_user_management_state
  ON conversations(user_id, management_state, updated_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('0007_conversation_management_state')
ON CONFLICT (version) DO NOTHING;

COMMIT;
