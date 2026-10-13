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

/**
 * Structured Gemini output must never be copied as a Tinder reply. In
 * particular, a MAX_TOKENS result can contain a partial JSON object that
 * used to be passed through verbatim into the draft UI.
 */
export function parseGenerationOutput(raw: string, personalMemoryIds: readonly string[]): { text: string; usedPersonalMemoryId?: string } {
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\\s*/i, "").replace(/\\s*\`\`\`$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
    // A few providers double-encode their response as a JSON string.
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
  } catch {
    throw new Error("gemini_invalid_output");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("gemini_invalid_output");
  }
  const text = (parsed as { text?: unknown }).text;
  const used = (parsed as { usedPersonalMemoryId?: unknown }).usedPersonalMemoryId;
  if (typeof text !== "string" || !text.trim()) throw new Error("gemini_invalid_output");

  // Do not accept a recursively wrapped JSON payload as a user-visible reply.
  const reply = text.trim();
  if (/^\\{\\s*"(?:text|usedPersonalMemoryId)"\\s*:/.test(reply)) {
    return parseGenerationOutput(reply, personalMemoryIds);
  }
  if (reply.startsWith('{"text"') || reply.startsWith('{"usedPersonalMemoryId"')) throw new Error("gemini_invalid_output");
  return {
    text: reply,
    ...(typeof used === "string" && personalMemoryIds.includes(used) ? { usedPersonalMemoryId: used } : {})
  };
}

export function createGeminiConversationProvider(credentials?: { apiKey: string; model: string }): GeminiConversationProvider {
  return async (input) => {
  const apiKey = (credentials?.apiKey ?? process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");
  const model = credentials?.model.trim() || configuredModel();
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
  if (input.userProfile?.topicEngine?.avoidedTopics?.length) {
    promptParts.push("The user prefers not to proactively raise these subjects. Do not suggest, steer toward, or invent related anecdotes. If the other person directly asks about one, respond normally and respectfully without abruptly refusing or changing subject.");
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
      generationConfig: { temperature: 0.8, maxOutputTokens: 1024, responseMimeType: "application/json" }
    })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const payload: unknown = await response.json();
  const candidates = (payload as { candidates?: Array<{ finishReason?: string }> } | null)?.candidates;
  if (candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("gemini_output_truncated");
  const raw = responseText(payload);
  if (!raw) throw new Error("gemini_empty_response");
  const generated = parseGenerationOutput(raw, input.personalMemories?.map((memory) => memory.id) ?? []);
  return { text: generated.text.slice(0, 4000), model, ...(generated.usedPersonalMemoryId ? { usedPersonalMemoryId: generated.usedPersonalMemoryId } : {}) };
  };
}

export const callGeminiConversationProvider: GeminiConversationProvider = createGeminiConversationProvider();
