BEGIN;

-- Every attempted Like is durably recorded. An uncertain attempt is never
-- automatically retried or discarded when local midnight passes.
CREATE TABLE IF NOT EXISTS user_smart_swipe_attempts (
  attempt_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key varchar(10) NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'ui_observed', 'uncertain')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_smart_swipe_attempts_user_day
  ON user_smart_swipe_attempts(user_id, day_key);
CREATE INDEX IF NOT EXISTS user_smart_swipe_attempts_unresolved
  ON user_smart_swipe_attempts(user_id)
  WHERE status IN ('reserved', 'uncertain');

-- Only one installation may own the account's Tinder work at a time.
CREATE TABLE IF NOT EXISTS user_smart_swipe_execution_lease (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  owner_device_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version)
VALUES ('0020_smart_swipe_attempt_ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
