BEGIN;

-- A reservation can be finalized without a Tinder action ONLY when the
-- extension's trusted pre-click guards explicitly report "blocked".
-- Historical uncertainty and confirmed UI transitions are unchanged.
ALTER TABLE user_smart_swipe_attempts
  DROP CONSTRAINT IF EXISTS user_smart_swipe_attempts_status_check;
ALTER TABLE user_smart_swipe_attempts
  ADD CONSTRAINT user_smart_swipe_attempts_status_check
  CHECK (status IN ('reserved', 'ui_observed', 'uncertain', 'not_clicked'));

COMMIT;
