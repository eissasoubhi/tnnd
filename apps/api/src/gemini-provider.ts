import type { PersistedGeminiConversationPayload } from "./effective-conversation-context-service.js";
import type {
  GenerationHumanActionContext,
  GenerationMatchProfileContext
} from "./generation-supplemental-context.js";
import type { GenerationUserProfileContext } from "./generation-user-profile-context.js";

export interface GeminiPersonalMemoryContext {
  id: string;
  title: string;
  summary: string;
  immutableFacts: string[];
  conversationHooks: string[];
}

export interface GeminiTopicContext {
  primaryTopic: { topic: string; subtopic: string | null; confidence: number } | null;
  secondaryTopics: Array<{ topic: string; subtopic: string | null; confidence: number }>;
  recentTopics: Array<{ topic: string; subtopic: string | null; confidence: number }>;
}

export interface GeminiRecentMessageContext {
  direction: "incoming" | "outgoing";
  text: string;
}

export interface GeminiConversationFactContext {
  subject: "match" | "user" | "shared";
  key: string;
  value: string;
  confidence: number;
}

export interface GeminiGenerationInput {
  context: PersistedGeminiConversationPayload;
  latestMessage: string;
  previewInstruction?: string;
  personalMemories?: GeminiPersonalMemoryContext[];
  topics?: GeminiTopicContext;
  conversationSummary?: string;
  recentMessages?: GeminiRecentMessageContext[];
  conversationFacts?: GeminiConversationFactContext[];
  matchProfile?: GenerationMatchProfileContext;
  humanActions?: GenerationHumanActionContext[];
  userProfile?: GenerationUserProfileContext;
}

export interface GeminiGenerationResult {
  text: string;
  model: string;
  usedPersonalMemoryId?: string;
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

function parseGenerationOutput(raw: string, personalMemoryIds: string[]): { text: string; usedPersonalMemoryId?: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    const text = (parsed as { text?: unknown }).text;
    const used = (parsed as { usedPersonalMemoryId?: unknown }).usedPersonalMemoryId;
    if (typeof text !== "string" || !text.trim()) throw new Error("invalid");
    return {
      text: text.trim(),
      ...(typeof used === "string" && personalMemoryIds.includes(used) ? { usedPersonalMemoryId: used } : {})
    };
  } catch {
    return { text: raw };
  }
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
  if (input.userProfile) {
    promptParts.push(
      "The user's compact profile follows. Treat identity and dating intent as user-provided context, and use texting/language preferences to make the reply sound like the user. Do not reveal private profile details unless the conversation naturally calls for them.",
      `User profile JSON: ${JSON.stringify(input.userProfile)}`
    );
  }
  if (input.conversationSummary?.trim()) {
    promptParts.push(
      "A durable summary of the older conversation history follows. Use it for long-term continuity and facts already established in the chat. Prefer recent messages when they conflict with or supersede older summary context.",
      `Conversation summary: ${input.conversationSummary.trim()}`
    );
  }
  if (input.recentMessages?.length) {
    promptParts.push(
      "Recent durable conversation messages follow in chronological order. Use them for local continuity and pronoun/reference resolution; do not repeat an outgoing message merely because it appears here.",
      `Recent messages JSON: ${JSON.stringify(input.recentMessages)}`
    );
  }
  if (input.conversationFacts?.length) {
    promptParts.push(
      "Grounded durable conversation facts follow. Use them only when relevant to continuity. Higher confidence is stronger evidence, but recent messages override stale facts. Do not expose a fact merely because it is stored and never embellish it beyond the supplied value.",
      `Conversation facts JSON: ${JSON.stringify(input.conversationFacts)}`
    );
  }
  if (input.topics) {
    promptParts.push(
      "Conversation Topic Engine state follows. Use it to maintain continuity, avoid unnecessary repetition, and make natural subject transitions. Treat confidence as uncertain context rather than fact.",
      `Topic state JSON: ${JSON.stringify(input.topics)}`
    );
  }
  if (input.matchProfile) {
    promptParts.push(
      "Visible match-profile context follows. Use it only when relevant and naturally. Do not claim the match stated these profile facts in chat, and avoid repeatedly mentioning profile details.",
      `Match profile JSON: ${JSON.stringify(input.matchProfile)}`
    );
  }
  if (input.humanActions?.length) {
    promptParts.push(
      "Human-action state follows. Pending actions represent real-world or manual constraints: never claim they happened and do not work around them. Completed manual answers are user-provided facts that may be phrased naturally when relevant. Ignored actions are not included.",
      `Human actions JSON: ${JSON.stringify(input.humanActions)}`
    );
  }
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
  promptParts.push(
    "Return JSON only with shape {\"text\":\"reply\",\"usedPersonalMemoryId\":null}. Set usedPersonalMemoryId to the exact supplied memory id only when that memory materially influenced the reply; otherwise null."
  );
  const prompt = promptParts.join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 220, responseMimeType: "application/json" }
    })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const payload: unknown = await response.json();
  const raw = responseText(payload);
  if (!raw) throw new Error("gemini_empty_response");
  const generated = parseGenerationOutput(raw, input.personalMemories?.map((memory) => memory.id) ?? []);
  return { text: generated.text.slice(0, 4000), model, ...(generated.usedPersonalMemoryId ? { usedPersonalMemoryId: generated.usedPersonalMemoryId } : {}) };
};
