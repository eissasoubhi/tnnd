CREATE TABLE conversation_summaries (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  summary text NOT NULL,
  summarized_message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (summarized_message_count >= 0),
  CHECK (char_length(summary) <= 12000)
);
