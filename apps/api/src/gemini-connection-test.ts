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
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": settings.apiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 }
      }),
      signal: AbortSignal.timeout(10_000)
    }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("gemini_credentials_rejected");
    if (response.status === 404) throw new Error("gemini_model_unavailable");
    throw new Error("gemini_connection_failed");
  }

  return { provider: "gemini", model: settings.model, connected: true };
}
