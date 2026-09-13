import { buildTextingStyleAnalysisPrompt, validateTextingStyleAnalysis, type TextingStyleAnalysis } from "./texting-style-analysis.js";

export interface TextingStyleAnalysisProviderResult {
  analysis: TextingStyleAnalysis;
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

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(withoutFence);
}

export async function analyzeTextingStyleWithGemini(examples: string): Promise<TextingStyleAnalysisProviderResult> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");

  const model = configuredModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildTextingStyleAnalysisPrompt(examples) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 700,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const payload: unknown = await response.json();
  const text = responseText(payload);
  if (!text) throw new Error("gemini_empty_response");

  let parsed: unknown;
  try {
    parsed = parseJsonObject(text);
  } catch {
    throw new Error("gemini_invalid_json");
  }

  const validated = validateTextingStyleAnalysis(parsed);
  if (!validated.ok) {
    throw new Error(validated.field ? `gemini_invalid_analysis:${validated.field}` : "gemini_invalid_analysis");
  }

  return { analysis: validated.value, model };
}
