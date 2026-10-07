import { loadAiProviderSettings } from "./ai-provider-settings-service.js";
import { normalizeIdentitySource, parseIdentityStructuredAnalysis, type IdentityStructuredAnalysis } from "./identity-builder-contract.js";

export interface IdentityAnalysisResult {
  analysis: IdentityStructuredAnalysis;
  model: string;
}

function responseText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  const first = candidates[0];
  if (!first || typeof first !== "object") return "";
  const parts = (first as { content?: { parts?: unknown } }).content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
    ? (part as { text: string }).text
    : "").join("").trim();
}

export async function analyzeIdentityWithGemini(userId: string, sourceValue: unknown): Promise<IdentityAnalysisResult> {
  const source = normalizeIdentitySource(sourceValue);
  const settings = await loadAiProviderSettings(userId);
  if (!settings) throw new Error("ai_provider_not_configured");

  const prompt = [
    "Analyze this user's self-description for TNND.",
    "Extract only information grounded in the source. Never invent facts.",
    "Produce a compact reusable identity profile for future dating conversations.",
    "Keep entries concise so the profile is cheap to reuse in prompts.",
    "",
    "SOURCE:",
    source
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": settings.apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1800,
        thinkingConfig: { thinkingLevel: "LOW" },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["summary","stableFacts","interests","lifestyle","preferences","personalityTraits","conversationTopics","avoidTopics"],
          properties: {
            summary: { type: "STRING" },
            stableFacts: { type: "ARRAY", items: { type: "STRING" } },
            interests: { type: "ARRAY", items: { type: "STRING" } },
            lifestyle: { type: "ARRAY", items: { type: "STRING" } },
            preferences: { type: "ARRAY", items: { type: "STRING" } },
            personalityTraits: { type: "ARRAY", items: { type: "STRING" } },
            conversationTopics: { type: "ARRAY", items: { type: "STRING" } },
            avoidTopics: { type: "ARRAY", items: { type: "STRING" } }
          }
        }
      }
    }),
    signal: AbortSignal.timeout(25_000)
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("gemini_credentials_rejected");
    if (response.status === 404) throw new Error("gemini_model_unavailable");
    throw new Error(`gemini_provider_error:${response.status}`);
  }

  const raw = responseText(await response.json());
  if (!raw) throw new Error("gemini_empty_response");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("gemini_invalid_identity_json"); }
  return { analysis: parseIdentityStructuredAnalysis(parsed), model: settings.model };
}
