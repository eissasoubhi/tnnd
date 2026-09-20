import { loadAiProviderSettings } from "./ai-provider-settings-service.js";

export interface GeminiConnectionTestResult {
  provider: "gemini";
  model: string;
  connected: true;
}

type SettingsLoader = typeof loadAiProviderSettings;
type Fetcher = typeof fetch;

export async function testGeminiConnection(
  userId: string,
  loadSettings: SettingsLoader = loadAiProviderSettings,
  fetcher: Fetcher = fetch
): Promise<GeminiConnectionTestResult> {
  const settings = await loadSettings(userId);
  if (!settings) throw new Error("ai_provider_not_configured");

  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}?key=${encodeURIComponent(settings.apiKey)}`,
    { method: "GET", signal: AbortSignal.timeout(10_000) }
  );

  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403 ? "gemini_credentials_rejected" : "gemini_connection_failed");
  }

  return { provider: "gemini", model: settings.model, connected: true };
}
