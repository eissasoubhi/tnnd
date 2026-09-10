import { buildSystemInstruction, buildUserPrompt } from "./prompt";
import type { AppConfig, GeneratePurpose } from "./types";

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

function cleanJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseSuggestions(text: string, count: number): string[] {
  const parsed = JSON.parse(cleanJson(text)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Gemini did not return an array of suggestions.");
  const suggestions = parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, count);
  if (!suggestions.length) throw new Error("Gemini returned no usable suggestions.");
  return suggestions;
}

export async function generateSuggestions(apiKey: string, config: AppConfig, context: string, purpose: GeneratePurpose = "manual", count = config.replyCount): Promise<string[]> {
  const model = config.model.trim();
  if (!apiKey) throw new Error("Gemini API key is missing. Open TNND settings first.");
  if (!model) throw new Error("Gemini model is missing.");
  if (!context.trim()) throw new Error("No conversation context was found.");
  const safeCount = Math.max(1, Math.min(3, count));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemInstruction(config, safeCount, purpose) }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(context, purpose) }] }],
      generationConfig: { temperature: 0.95, maxOutputTokens: 500 }
    })
  });

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) throw new Error(data.error?.message || `Gemini request failed (${response.status}).`);
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return parseSuggestions(text, safeCount);
}
