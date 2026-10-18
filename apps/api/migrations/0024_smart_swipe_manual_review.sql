BEGIN;

-- A user can acknowledge having reviewed an uncertain attempt without
-- asserting Tinder accepted it. Status remains 'uncertain' forever.
ALTER TABLE user_smart_swipe_attempts
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_kind text;

-- A review closes automatic authorization across ALL installations.
-- Explicit popup Start must authorize exactly its device before any new claim.
CREATE TABLE IF NOT EXISTS user_smart_swipe_rearm_gate (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  authorized_device_id uuid,
  authorized_at timestamptz
);

COMMIT;
