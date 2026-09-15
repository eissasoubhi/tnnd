CREATE TABLE conversation_topics (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  topic text NOT NULL,
  subtopic text,
  confidence real NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  first_discussed_at timestamptz NOT NULL,
  last_discussed_at timestamptz NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, topic, subtopic),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (message_count >= 0)
);

CREATE INDEX conversation_topics_current_idx
  ON conversation_topics (conversation_id, is_current, last_discussed_at DESC);

CREATE TABLE conversation_topic_transitions (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_topic text,
  to_topic text NOT NULL,
  transitioned_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversation_topic_transitions_conversation_idx
  ON conversation_topic_transitions (conversation_id, transitioned_at DESC);
