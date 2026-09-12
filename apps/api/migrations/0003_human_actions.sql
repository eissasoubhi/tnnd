BEGIN;

CREATE TABLE IF NOT EXISTS human_actions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_ref text,
  conversation_label text NOT NULL DEFAULT '',
  title text NOT NULL,
  detail text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'action-required', 'decision-required', 'urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'ignored')),
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS human_actions_user_status_created_idx
  ON human_actions(user_id, status, created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('0003_human_actions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
