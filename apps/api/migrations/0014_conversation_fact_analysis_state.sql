BEGIN;

CREATE TABLE IF NOT EXISTS conversation_fact_analysis_state (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  last_processed_created_at timestamptz NOT NULL,
  last_processed_message_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version)
VALUES ('0014_conversation_fact_analysis_state')
ON CONFLICT (version) DO NOTHING;

COMMIT;
