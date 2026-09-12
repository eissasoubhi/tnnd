BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS temporary_instruction text,
  ADD COLUMN IF NOT EXISTS temporary_instruction_scope text,
  ADD COLUMN IF NOT EXISTS temporary_instruction_remaining integer;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_temporary_instruction_scope_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_temporary_instruction_scope_check
  CHECK (
    temporary_instruction_scope IS NULL
    OR temporary_instruction_scope IN ('next-message', 'next-n-replies', 'until-cleared')
  );

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_temporary_instruction_remaining_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_temporary_instruction_remaining_check
  CHECK (temporary_instruction_remaining IS NULL OR temporary_instruction_remaining > 0);

INSERT INTO schema_migrations(version)
VALUES ('0005_conversation_temporary_instructions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
