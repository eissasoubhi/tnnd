BEGIN;

-- Labels entered by the TNND user, separate from facts captured from Tinder.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS display_label TEXT,
  ADD COLUMN IF NOT EXISTS display_age SMALLINT;

ALTER TABLE conversations
  ADD CONSTRAINT conversation_display_label_length
    CHECK (display_label IS NULL OR char_length(display_label) <= 80),
  ADD CONSTRAINT conversation_display_age_range
    CHECK (display_age IS NULL OR display_age BETWEEN 18 AND 120);

INSERT INTO schema_migrations(version)
VALUES ('0017_conversation_display_identity')
ON CONFLICT (version) DO NOTHING;

COMMIT;
