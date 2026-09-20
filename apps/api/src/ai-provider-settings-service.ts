import { getPool } from "./db-client.js";
import { decryptSecret, encryptSecret } from "./secret-encryption.js";

export interface AiProviderSettingsInput {
  model: string;
  apiKey: string;
}

export interface AiProviderSettings {
  provider: "gemini";
  model: string;
  apiKey: string;
}

export interface AiProviderSettingsSummary {
  provider: "gemini";
  model: string;
  configured: true;
  updatedAt: string;
}

function required(value: string, error: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(error);
  return normalized;
}

export async function saveAiProviderSettings(
  userId: string,
  input: AiProviderSettingsInput
): Promise<AiProviderSettingsSummary> {
  const normalizedUserId = required(userId, "user_id_required");
  const model = required(input.model, "ai_model_required");
  const apiKey = required(input.apiKey, "ai_api_key_required");
  const encryptedApiKey = encryptSecret(apiKey);
  const result = await getPool().query<{ model: string; updated_at: Date }>(
    `INSERT INTO ai_provider_settings (user_id, provider, model, encrypted_api_key)
     VALUES ($1, 'gemini', $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       encrypted_api_key = EXCLUDED.encrypted_api_key,
       updated_at = now()
     RETURNING model, updated_at`,
    [normalizedUserId, model, encryptedApiKey]
  );
  const row = result.rows[0];
  if (!row) throw new Error("ai_provider_settings_save_failed");
  return { provider: "gemini", model: row.model, configured: true, updatedAt: row.updated_at.toISOString() };
}

export async function loadAiProviderSettings(userId: string): Promise<AiProviderSettings | null> {
  const normalizedUserId = required(userId, "user_id_required");
  const result = await getPool().query<{ model: string; encrypted_api_key: string }>(
    `SELECT model, encrypted_api_key
       FROM ai_provider_settings
      WHERE user_id = $1 AND provider = 'gemini'`,
    [normalizedUserId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { provider: "gemini", model: row.model, apiKey: decryptSecret(row.encrypted_api_key) };
}
