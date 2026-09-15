import { parsePersonalMemoryStructuredAnalysis, type PersonalMemoryStructuredAnalysis } from "./personal-memory-contract.js";
import { normalizePersonalMemoryOriginalText } from "./personal-memory-service.js";

export interface PersonalMemoryAnalysisProviderResult {
  analysis: PersonalMemoryStructuredAnalysis;
  model: string;
}

function configuredModel(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim() || "gemini-2.5-flash";
}

function responseText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts.map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "").join("").trim();
    if (text) return text;
  }
  return "";
}

function prompt(originalText: string): string {
  return `Analyze this true personal anecdote for TNND. Return JSON only with exactly these fields: title, category, summary, immutableFacts, topics, conversationHooks, sensitivity, allowedForChat, creativeFreedom. sensitivity must be low|medium|high. creativeFreedom must be strict|natural|storyteller. Preserve only facts grounded in the source. Do not invent people, places, dates, events or precise claims. immutableFacts must contain the core facts that may never be altered. conversationHooks should describe natural situations where the memory could be relevant, without forcing its use.\n\nSOURCE ANECDOTE:\n${originalText}`;
}

export async function analyzePersonalMemoryWithGemini(originalTextValue: unknown): Promise<PersonalMemoryAnalysisProviderResult> {
  const originalText = normalizePersonalMemoryOriginalText(originalTextValue);
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");
  const model = configuredModel();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt(originalText) }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1200, responseMimeType: "application/json" }
    })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const text = responseText(await response.json());
  if (!text) throw new Error("gemini_empty_response");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("gemini_invalid_json"); }
  try {
    return { analysis: parsePersonalMemoryStructuredAnalysis(parsed), model };
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_analysis";
    throw new Error(`gemini_invalid_personal_memory:${code}`);
  }
}
