import { loadAiProviderSettingsSummary, saveAiProviderSettings, type AiProviderSettingsInput, type AiProviderSettingsSummary } from "./ai-provider-settings-service.js";

export interface AiProviderSettingsControllerResult {
  status: number;
  body: AiProviderSettingsSummary | { error: string };
}

export type AiProviderSettingsSaver = (
  userId: string,
  input: AiProviderSettingsInput
) => Promise<AiProviderSettingsSummary>;

export type AiProviderSettingsSummaryLoader = (
  userId: string
) => Promise<AiProviderSettingsSummary | null>;

function requiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleGetAiProviderSettingsRequest(
  userId: string,
  load: AiProviderSettingsSummaryLoader = loadAiProviderSettingsSummary
): Promise<AiProviderSettingsControllerResult> {
  const summary = await load(userId);
  return summary
    ? { status: 200, body: summary }
    : { status: 404, body: { error: "ai_provider_settings_not_configured" } };
}

export async function handleSaveAiProviderSettingsRequest(
  userId: string,
  body: Record<string, unknown>,
  save: AiProviderSettingsSaver = saveAiProviderSettings
): Promise<AiProviderSettingsControllerResult> {
  const model = requiredString(body.model);
  const apiKey = requiredString(body.apiKey);
  if (!model) return { status: 400, body: { error: "ai_model_required" } };
  if (!apiKey) return { status: 400, body: { error: "ai_api_key_required" } };

  const summary = await save(userId, { model, apiKey });
  return { status: 200, body: summary };
}
