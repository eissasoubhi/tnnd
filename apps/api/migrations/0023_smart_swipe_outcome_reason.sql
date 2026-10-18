BEGIN;

-- Only technical, non-identifying result codes are recorded. Older attempts
-- legitimately have NULL because their worker versions did not send a reason.
-- The original status is never changed by this migration.
ALTER TABLE user_smart_swipe_attempts
  ADD COLUMN IF NOT EXISTS outcome_reason varchar(64);

COMMIT;
