BEGIN;

CREATE TABLE IF NOT EXISTS personal_memories (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_text text NOT NULL CHECK (char_length(original_text) BETWEEN 1 AND 20000),
  structured_analysis jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'approved')),
  approved_at timestamptz,
  last_used_at timestamptz,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (review_status = 'draft' AND approved_at IS NULL)
    OR (review_status = 'approved' AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_personal_memories_user_updated
  ON personal_memories(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_memories_user_approved
  ON personal_memories(user_id, updated_at DESC)
  WHERE review_status = 'approved';

INSERT INTO schema_migrations(version)
VALUES ('0010_personal_memories')
ON CONFLICT (version) DO NOTHING;

COMMIT;
