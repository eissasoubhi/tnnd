BEGIN;

CREATE TABLE IF NOT EXISTS conversation_facts (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (subject IN ('match', 'user', 'shared')),
  fact_key text NOT NULL,
  fact_value text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, subject, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_conversation_facts_conversation_updated
  ON conversation_facts(conversation_id, updated_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('0013_conversation_facts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
