import { loadAiProviderSettings } from "./ai-provider-settings-service.js";
import { parsePersonalMemoryStructuredAnalysis, type PersonalMemoryStructuredAnalysis } from "./personal-memory-contract.js";
import { normalizePersonalMemoryOriginalText } from "./personal-memory-service.js";

export interface PersonalMemoryAnalysisProviderResult {
  analysis: PersonalMemoryStructuredAnalysis;
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

export async function analyzePersonalMemoryWithGemini(
  userId: string,
  originalTextValue: unknown
): Promise<PersonalMemoryAnalysisProviderResult> {
  const originalText = normalizePersonalMemoryOriginalText(originalTextValue);
  const settings = await loadAiProviderSettings(userId);
  if (!settings) throw new Error("ai_provider_not_configured");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": settings.apiKey },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{
          text: [
            "Analyze this true personal anecdote for TNND.",
            "Preserve only facts grounded in the source. Never invent people, places, dates, events or precise claims.",
            "Keep the summary and hooks compact because only the structured result will be reused in future prompts.",
            "",
            "SOURCE ANECDOTE:",
            originalText
          ].join("\n")
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1600,
        thinkingConfig: { thinkingLevel: "LOW" },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["title","category","summary","immutableFacts","topics","conversationHooks","sensitivity","allowedForChat","creativeFreedom"],
          properties: {
            title: { type: "STRING" },
            category: { type: "STRING" },
            summary: { type: "STRING" },
            immutableFacts: { type: "ARRAY", items: { type: "STRING" } },
            topics: { type: "ARRAY", items: { type: "STRING" } },
            conversationHooks: { type: "ARRAY", items: { type: "STRING" } },
            sensitivity: { type: "STRING", enum: ["low","medium","high"] },
            allowedForChat: { type: "BOOLEAN" },
            creativeFreedom: { type: "STRING", enum: ["strict","natural","storyteller"] }
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

  const text = responseText(await response.json());
  if (!text) throw new Error("gemini_empty_response");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("gemini_invalid_json"); }
  try {
    return { analysis: parsePersonalMemoryStructuredAnalysis(parsed), model: settings.model };
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_analysis";
    throw new Error(`gemini_invalid_personal_memory:${code}`);
  }
}
