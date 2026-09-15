import type { PersistedGeminiConversationPayload } from "./effective-conversation-context-service.js";

export interface GeminiPersonalMemoryContext {
  id: string;
  title: string;
  summary: string;
  immutableFacts: string[];
  conversationHooks: string[];
}

export interface GeminiGenerationInput {
  context: PersistedGeminiConversationPayload;
  latestMessage: string;
  previewInstruction?: string;
  personalMemories?: GeminiPersonalMemoryContext[];
}

export interface GeminiGenerationResult {
  text: string;
  model: string;
}

export type GeminiConversationProvider = (input: GeminiGenerationInput) => Promise<GeminiGenerationResult>;

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

export const callGeminiConversationProvider: GeminiConversationProvider = async (input) => {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");
  const model = configuredModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const promptParts = [
    "You are generating one concise dating-chat reply for TNND.",
    "Respect the supplied effective settings and instructions. Never fabricate mutual interest or ignore expressed boundaries.",
    `Effective context JSON: ${JSON.stringify(input.context)}`,
    `Latest incoming message: ${input.latestMessage}`
  ];
  if (input.personalMemories?.length) {
    promptParts.push(
      "Relevant approved Personal Memories follow. They are optional context, not mandatory content. Use at most one only when it fits naturally. Never invent or alter immutable facts, and do not force an anecdote into the reply.",
      `Personal Memories JSON: ${JSON.stringify(input.personalMemories)}`
    );
  }
  if (input.previewInstruction?.trim()) {
    promptParts.push(
      "Preview-only regeneration instruction follows. Apply it only to this generated draft; it does not change durable conversation settings.",
      input.previewInstruction.trim()
    );
  }
  promptParts.push("Return only the reply text.");
  const prompt = promptParts.join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 220 }
    })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const payload: unknown = await response.json();
  const text = responseText(payload);
  if (!text) throw new Error("gemini_empty_response");
  return { text: text.slice(0, 4000), model };
};
