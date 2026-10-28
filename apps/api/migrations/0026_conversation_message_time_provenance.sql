BEGIN;

-- sent_at is sometimes an import-order placeholder (observedAt + index ms).
-- Never treat those values, or legacy unknown rows, as genuine Tinder send time.
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS sent_at_verified boolean NOT NULL DEFAULT false;

COMMIT;
