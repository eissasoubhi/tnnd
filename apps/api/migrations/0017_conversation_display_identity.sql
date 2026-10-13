-- User-supplied conversation labels. These are explicitly not Tinder-captured
-- identity facts: keep them separate from read-only MatchProfile captures.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS display_label TEXT,
  ADD COLUMN IF NOT EXISTS display_age SMALLINT;

ALTER TABLE conversations
  ADD CONSTRAINT conversation_display_label_length
    CHECK (display_label IS NULL OR char_length(display_label) <= 80),
  ADD CONSTRAINT conversation_display_age_range
    CHECK (display_age IS NULL OR display_age BETWEEN 18 AND 120);
