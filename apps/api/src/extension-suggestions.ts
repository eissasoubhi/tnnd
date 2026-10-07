import { loadAiProviderSettings } from "./ai-provider-settings-service.js";

export interface ExtensionSuggestionRequest {
  context: string;
  purpose: "manual" | "auto" | "preview";
  count: number;
  config: Record<string, unknown>;
  chat?: Record<string, unknown>;
}

export interface ExtensionSuggestionResult {
  suggestions: string[];
  model: string;
}

type SettingsLoader = typeof loadAiProviderSettings;
type Fetcher = typeof fetch;

function cleanJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseSuggestions(text: string, count: number): string[] {
  const parsed = JSON.parse(cleanJson(text)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("gemini_invalid_suggestions");
  const suggestions = parsed
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, count);
  if (!suggestions.length) throw new Error("gemini_empty_response");
  return suggestions;
}

function responseText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "")
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

function boundedJson(value: unknown, max = 20_000): string {
  const json = JSON.stringify(value ?? {});
  if (json.length > max) throw new Error("extension_generation_config_too_large");
  return json;
}

export function validateExtensionSuggestionRequest(value: unknown): ExtensionSuggestionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_extension_generation_request");
  const input = value as Record<string, unknown>;
  const context = typeof input.context === "string" ? input.context.trim() : "";
  if (!context || context.length > 12_000) throw new Error("invalid_extension_generation_context");

  const purpose = input.purpose;
  if (purpose !== "manual" && purpose !== "auto" && purpose !== "preview") throw new Error("invalid_extension_generation_purpose");

  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("invalid_extension_generation_count");

  if (!input.config || typeof input.config !== "object" || Array.isArray(input.config)) throw new Error("invalid_extension_generation_config");
  boundedJson(input.config);

  const chat = input.chat;
  if (chat !== undefined && (!chat || typeof chat !== "object" || Array.isArray(chat))) throw new Error("invalid_extension_generation_chat");
  if (chat !== undefined) boundedJson(chat, 8_000);

  return {
    context,
    purpose,
    count,
    config: input.config as Record<string, unknown>,
    ...(chat ? { chat: chat as Record<string, unknown> } : {})
  };
}

export async function generateExtensionSuggestions(
  userId: string,
  request: ExtensionSuggestionRequest,
  loadSettings: SettingsLoader = loadAiProviderSettings,
  fetcher: Fetcher = fetch
): Promise<ExtensionSuggestionResult> {
  const settings = await loadSettings(userId);
  if (!settings) throw new Error("ai_provider_not_configured");

  const prompt = [
    "You are TNND, a dating conversation writing engine acting from the user's configured identity.",
    "Write concise, natural dating-app messages. Avoid assistant prose, canned pickup lines, pressure, manipulation, and invented personal facts.",
    `Generation purpose: ${request.purpose}.`,
    `Effective TNND configuration JSON: ${boundedJson(request.config)}`,
    request.chat ? `Per-chat configuration JSON: ${boundedJson(request.chat, 8_000)}` : "",
    "Use the recent conversation flow, answer what was actually said, and avoid abruptly changing subject.",
    "If context is incomplete, stay generic rather than inventing details.",
    `Conversation context:\n${request.context.slice(-9000)}`,
    `Return only a valid JSON array containing exactly ${request.count} distinct message string${request.count === 1 ? "" : "s"}. No markdown, explanation or labels.`
  ].filter(Boolean).join("\n\n");

  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": settings.apiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.95, maxOutputTokens: 500, responseMimeType: "application/json" }
      }),
      signal: AbortSignal.timeout(20_000)
    }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("gemini_credentials_rejected");
    if (response.status === 404) throw new Error("gemini_model_unavailable");
    throw new Error(`gemini_provider_error:${response.status}`);
  }
  const raw = responseText(await response.json());
  if (!raw) throw new Error("gemini_empty_response");

  return {
    suggestions: parseSuggestions(raw, request.count),
    model: settings.model
  };
}
