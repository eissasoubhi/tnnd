BEGIN;

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_thread_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_topic text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_thread_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  body text NOT NULL,
  sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_sent
  ON conversation_messages(conversation_id, sent_at ASC);

INSERT INTO schema_migrations(version)
VALUES ('0004_conversations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
