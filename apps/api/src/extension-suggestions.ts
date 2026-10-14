import { loadGenerationProfile } from "./generation-user-profile-context.js";
import { findConversationByExternalThreadId } from "./conversation-thread-lookup-service.js";
import { getConversation } from "./conversation-service.js";
import { getConversationMatchProfile } from "./match-profile-service.js";
import { matchProfileTopicGuidance } from "./match-profile-topic-hooks.js";
import { missingPersonalLocationDetail, personalLocationAnswerPolicy } from "./personal-location-policy.js";
import { createHumanAction, listHumanActions } from "./human-action-service.js";
import { assessMatchIntent, matchScreeningPrompt, type MatchScreeningOptions } from "./match-intent-screening.js";
import { conversationFlowGuidance, deriveConversationFlow } from "./conversation-flow.js";
import { retrievePersonalMemories } from "./personal-memory-service.js";
import { loadAiProviderSettings } from "./ai-provider-settings-service.js";
import { resolveAdaptiveStyle, type StyleMessage } from "./conversation-style-adaptation.js";
import type { ConversationOverrides } from "./conversation-overrides.js";

export interface ExtensionSuggestionRequest {
  context: string;
  purpose: "manual" | "auto" | "preview" | "opener";
  count: number;
  config: Record<string, unknown>;
  chat?: Record<string, unknown>;
  threadKey?: string;
}

export interface ExtensionSuggestionResult {
  suggestions: string[];
  model: string;
}

type SettingsLoader = typeof loadAiProviderSettings;
type Fetcher = typeof fetch;
export interface ExtensionGenerationContext {
  userProfile?: Record<string, unknown>;
  memories: Array<{ title: string; summary: string; immutableFacts: string[] }>;
}
type ContextLoader = (userId: string, context: string) => Promise<ExtensionGenerationContext>;

async function loadExtensionGenerationContext(userId: string, context: string): Promise<ExtensionGenerationContext> {
  const [profile, rankedMemories] = await Promise.all([
    loadGenerationProfile(userId),
    retrievePersonalMemories(userId, { context, limit: 2 })
  ]);
  return {
    ...(profile.userProfile ? { userProfile: profile.userProfile as unknown as Record<string, unknown> } : {}),
    memories: rankedMemories.map(({ memory }) => ({
      title: memory.structuredAnalysis.title.slice(0, 120),
      summary: memory.structuredAnalysis.summary.slice(0, 450),
      immutableFacts: memory.structuredAnalysis.immutableFacts.slice(0, 5).map((fact) => fact.slice(0, 160))
    }))
  };
}

function cleanJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseSuggestions(text: string, count: number): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson(text)) as unknown;
  } catch {
    throw new Error("gemini_invalid_suggestions");
  }
  if (!Array.isArray(parsed)) throw new Error("gemini_invalid_suggestions");
  const suggestions = parsed
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, count);
  if (!suggestions.length) throw new Error("gemini_empty_response");
  return suggestions;
}

function responseFinishReason(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  const first = candidates[0];
  return first && typeof first === "object" && typeof (first as { finishReason?: unknown }).finishReason === "string"
    ? (first as { finishReason: string }).finishReason
    : "";
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
  if (purpose !== "manual" && purpose !== "auto" && purpose !== "preview" && purpose !== "opener") throw new Error("invalid_extension_generation_purpose");

  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("invalid_extension_generation_count");

  if (!input.config || typeof input.config !== "object" || Array.isArray(input.config)) throw new Error("invalid_extension_generation_config");
  boundedJson(input.config);

  const threadKey = input.threadKey;
  if (threadKey !== undefined && (typeof threadKey !== "string" || !threadKey.trim() || threadKey.length > 512)) throw new Error("invalid_extension_generation_thread");
  const chat = input.chat;
  if (chat !== undefined && (!chat || typeof chat !== "object" || Array.isArray(chat))) throw new Error("invalid_extension_generation_chat");
  if (chat !== undefined) boundedJson(chat, 8_000);

  return {
    context,
    purpose,
    count,
    config: input.config as Record<string, unknown>,
    ...(chat ? { chat: chat as Record<string, unknown> } : {}),
    ...(threadKey ? { threadKey: threadKey.trim() } : {})
  };
}

export async function generateExtensionSuggestions(
  userId: string,
  request: ExtensionSuggestionRequest,
  loadSettings: SettingsLoader = loadAiProviderSettings,
  fetcher: Fetcher = fetch,
  loadContext: ContextLoader = loadExtensionGenerationContext
): Promise<ExtensionSuggestionResult> {
  const settings = await loadSettings(userId);
  if (!settings) throw new Error("ai_provider_not_configured");
  const generationContext = await loadContext(userId, request.context);
  const { identity: _clientIdentity, ...configWithoutIdentity } = request.config;
  const memoryContext = generationContext.memories;
  const storedStyle = generationContext.userProfile?.textingStyle as Record<string, unknown> | undefined;
  const topicPreferences = generationContext.userProfile?.topicEngine as { avoidedTopics?: string[] } | undefined;
  // Only clearly marked incoming lines count as evidence; unstructured text falls back to baseline.
  const history: StyleMessage[] = request.context.split("\n").slice(-24).flatMap(line => {
    const match = line.match(/^\s*(them|match|incoming|elle|lui)\s*:\s*(.+)$/i);
    return match ? [{ direction: "incoming" as const, text: match[2].slice(0, 1200) }] : [];
  });
  const manual = request.chat ?? {};
  const adaptive = resolveAdaptiveStyle(
    { ...configWithoutIdentity, ...manual } as ConversationOverrides,
    storedStyle ?? {},
    history,
    history.at(-1)?.text ?? "",
    Object.keys(manual),
    (generationContext.userProfile?.languages ?? {}) as Partial<{fr:number;darija:number;en:number}>
  );
  const effectiveConfig = { ...configWithoutIdentity, ...adaptive.settings };
  // Do not make another LLM call to track the stage. Use durable messages
  // already synchronized under this authenticated user and its existing facts.
  const flowEnabled = configWithoutIdentity.conversationFlowEnabled !== false;
  const flowLookup = flowEnabled && request.purpose !== "opener" && request.threadKey
    ? await findConversationByExternalThreadId(userId, request.threadKey) : null;
  const storedConversation = flowLookup ? await getConversation(userId, flowLookup.id) : null;
  const observedMessages = request.context.split("\n").slice(-50).flatMap(line => {
    const match = /^\s*(them|match|incoming|elle|lui|me|you|moi|outgoing)\s*:\s*(.+)$/i.exec(line);
    if (!match) return [];
    return [{ direction: /^(me|you|moi|outgoing)$/i.test(match[1]) ? "outgoing" as const : "incoming" as const,
      text: match[2].slice(0, 600) }];
  });
  const stageOrder = configWithoutIdentity.conversationFlowOrder === "work-first"
    ? ["occupation", "location", "interests"] as const
    : configWithoutIdentity.conversationFlowOrder === "interests-first"
      ? ["interests", "location", "occupation"] as const : ["location", "occupation", "interests"] as const;
  const capturedProfile = storedConversation ? await getConversationMatchProfile(userId, storedConversation.id) : null;
  const savedDatingIntent = generationContext.userProfile?.datingIntent;
  const matchRules = (savedDatingIntent as Record<string, unknown> | undefined)?.matchScreening as MatchScreeningOptions | undefined;
  const matchScreening = request.purpose === "opener" ? null : assessMatchIntent(
    storedConversation ? [...storedConversation.messages.slice(-60), ...observedMessages.slice(-10)] : observedMessages,
    capturedProfile?.normalizedProfile.fields ?? null, matchRules ?? {}
  );
  const conversationFlow = !flowEnabled || request.purpose === "opener" ? null
    : deriveConversationFlow(storedConversation ? [...storedConversation.messages.slice(-80), ...observedMessages.slice(-12)] : observedMessages,
      storedConversation?.conversationFlow.known.map(fact => ({ ...fact, subject: "match" as const, confidence: 1 })) ?? [],
      { order: stageOrder });
  // A missing, specific personal fact is a human action, not a Gemini
  // creativity task. This check happens BEFORE any call to Gemini or Send.
  if (request.purpose === "auto" && storedConversation) {
    const latestIncoming = [...observedMessages].reverse().find(m => m.direction === "incoming");
    const identity = generationContext.userProfile?.identity as Record<string, string> | undefined;
    const missing = latestIncoming
      ? missingPersonalLocationDetail(latestIncoming.text, identity) : null;
    if (missing) {
      const pending = (await listHumanActions(userId)).some(item =>
        item.conversationRef === storedConversation.id && item.status === "pending"
        && item.context.kind === "missing-personal-location"
        && item.context.field === missing);
      if (!pending) {
        await createHumanAction(userId,{
          conversationRef:storedConversation.id,
          title:"Personal location detail needed",
          detail:"Match asked a precise question that needs your verified answer. Fill in the location in Profile → Location or reply manually, then resolve this action.",
          severity:"action-required",
          context:{kind:"missing-personal-location",field:missing}
        });
      }
      throw new Error("human_clarification_required");
    }
  }
  const profileTopicHooks = matchProfileTopicGuidance(
    capturedProfile?.normalizedProfile.fields, conversationFlow,
    storedConversation ? [...storedConversation.messages.slice(-80), ...observedMessages.slice(-12)] : observedMessages,
    { purpose: request.purpose, avoidedTopics: topicPreferences?.avoidedTopics }
  );
  const avoidInstruction = Array.isArray(topicPreferences?.avoidedTopics) && topicPreferences.avoidedTopics.length
    ? "Do not proactively raise the user-avoided topics in the stored profile. If directly asked, respond normally without abruptly evading the question."
    : "";


  const prompt = [
    "You are TNND, a dating conversation writing engine acting from the user's configured identity.",
    "Write concise, natural dating-app messages. Avoid assistant prose, canned pickup lines, pressure, manipulation, and invented personal facts.",
    `Generation purpose: ${request.purpose}.`,
    `Effective TNND configuration JSON: ${boundedJson(effectiveConfig, 12_000)}`,
    generationContext.userProfile ? `Stored user identity/style JSON: ${boundedJson(generationContext.userProfile, 5_000)}` : "",
    memoryContext.length ? `Relevant approved personal memories JSON: ${boundedJson(memoryContext, 3_500)}` : "",
    request.chat ? `Per-chat configuration JSON: ${boundedJson(request.chat, 8_000)}` : "",
    adaptive.autoFields.length
      ? `Auto-adaptive relative to the saved user baseline: ${adaptive.autoFields.join(", ")}. Return to baseline when mood changes. Adapt conservatively; never force jokes or teasing. Double texting never causes extra sends.`
      : "",
    avoidInstruction,
    conversationFlow ? conversationFlowGuidance(conversationFlow) : "",
    matchScreening ? matchScreeningPrompt(matchScreening) : "",
    profileTopicHooks,
    personalLocationAnswerPolicy(generationContext.userProfile?.identity as Record<string, string> | undefined),
    request.purpose === "opener"
      ? "Write ONE opening Tinder turn with 2 or 3 short lines separated by newline characters inside one JSON array string. The lines will be sent as separate Tinder bubbles, NOT alternative messages. The FIRST line must be ONLY a short greeting (Salut, Hello, Hi, or Salut cv?); the next one or two lines should be natural short follow-ups without repeating the greeting. No previous messages exist. Do not invent profile facts, feelings, compliments or reactions (for example claiming their profile made the sender smile). Only the match name/age explicitly shown in the conversation context are verified. No profile photo, bio or appearance is verified. A neutral greeting and one natural question are better than fake personalization."
      : "Use the recent conversation flow, answer what was actually said, and avoid abruptly changing subject.",
    "If context is incomplete, stay generic rather than inventing details. Never claim an unverified reaction to a match profile.",
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
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: "LOW" },
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            minItems: request.count,
            maxItems: request.count,
            items: { type: "STRING" }
          }
        }
      }),
      signal: AbortSignal.timeout(20_000)
    }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("gemini_credentials_rejected");
    if (response.status === 404) throw new Error("gemini_model_unavailable");
    throw new Error(`gemini_provider_error:${response.status}`);
  }
  const payload = await response.json();
  if (responseFinishReason(payload) === "MAX_TOKENS") throw new Error("gemini_response_truncated");
  const raw = responseText(payload);
  if (!raw) throw new Error("gemini_empty_response");

  return {
    suggestions: parseSuggestions(raw, request.count),
    model: settings.model
  };
}
