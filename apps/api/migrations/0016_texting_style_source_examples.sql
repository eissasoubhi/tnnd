BEGIN;

CREATE TABLE IF NOT EXISTS texting_style_source_examples (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  examples text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT texting_style_source_examples_not_blank CHECK (length(btrim(examples)) > 0),
  CONSTRAINT texting_style_source_examples_max_length CHECK (length(examples) <= 12000)
);

INSERT INTO schema_migrations(version)
VALUES ('0016_texting_style_source_examples')
ON CONFLICT (version) DO NOTHING;

COMMIT;
