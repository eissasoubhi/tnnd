BEGIN;

-- Source-backed metadata only. No social handle, phone number, or message body.
-- Existing conversations remain unknown unless a verified new handoff is observed.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS handoff_platform text,
  ADD COLUMN IF NOT EXISTS handoff_source_external_message_id text;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_handoff_platform_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_handoff_platform_check
  CHECK (handoff_platform IS NULL OR handoff_platform IN ('instagram', 'whatsapp', 'snapchat', 'telegram'));

INSERT INTO schema_migrations(version)
VALUES ('0019_conversation_handoff_platform')
ON CONFLICT (version) DO NOTHING;

COMMIT;
