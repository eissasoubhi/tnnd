BEGIN;

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gemini',
  model text NOT NULL,
  encrypted_api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_provider_settings_provider_check CHECK (provider = 'gemini'),
  CONSTRAINT ai_provider_settings_model_not_empty CHECK (length(trim(model)) > 0),
  CONSTRAINT ai_provider_settings_api_key_not_empty CHECK (length(trim(encrypted_api_key)) > 0)
);

INSERT INTO schema_migrations(version)
VALUES ('0015_ai_provider_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
