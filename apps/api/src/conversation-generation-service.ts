import { getConversation } from "./conversation-service.js";
import { validateConversationOverrides, type ConversationOverrides } from "./conversation-overrides.js";
import { getConversationTopicState } from "./conversation-topic-service.js";
import { getPool } from "./db-client.js";
import { loadGeminiConversationPayload } from "./effective-conversation-context-service.js";
import {
  callGeminiConversationProvider,
  type GeminiConversationProvider,
  type GeminiGenerationResult
} from "./gemini-provider.js";
import { markPersonalMemoriesUsed, retrievePersonalMemories } from "./personal-memory-service.js";

function safeGlobalDefaults(value: unknown): ConversationOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const conversationDefaults = (value as { conversationDefaults?: unknown }).conversationDefaults;
  if (!conversationDefaults) return {};
  try {
    return validateConversationOverrides(conversationDefaults);
  } catch {
    return {};
  }
}

async function loadGlobalDefaults(userId: string): Promise<ConversationOverrides> {
  const result = await getPool().query<{ profile_json: unknown }>(
    "SELECT profile_json FROM user_profiles WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  return safeGlobalDefaults(result.rows[0]?.profile_json);
}

export interface ConversationGenerationResult extends GeminiGenerationResult {
  conversationId: string;
  provenance: {
    overriddenFields: string[];
    hasPersistentInstruction: boolean;
    hasTemporaryInstruction: boolean;
    hasPreviewInstruction: boolean;
    personalMemoryCandidateIds: string[];
    usedPersonalMemoryId: string | null;
  };
}

export async function generateConversationReply(
  userId: string,
  conversationId: string,
  latestMessage: string,
  provider: GeminiConversationProvider = callGeminiConversationProvider,
  previewInstruction?: string
): Promise<ConversationGenerationResult | null> {
  const normalizedMessage = latestMessage.trim();
  if (!normalizedMessage || normalizedMessage.length > 4000) throw new Error("invalid_generation_message");
  const normalizedPreviewInstruction = previewInstruction?.trim() ?? "";
  if (normalizedPreviewInstruction.length > 1000) throw new Error("invalid_preview_instruction");

  const [conversation, defaults, topicState] = await Promise.all([
    getConversation(userId, conversationId),
    loadGlobalDefaults(userId),
    getConversationTopicState(conversationId)
  ]);
  if (!conversation) return null;

  const temporaryInstruction = conversation.temporaryInstruction
    ? {
        text: conversation.temporaryInstruction.text,
        scope: conversation.temporaryInstruction.scope,
        remainingReplies: conversation.temporaryInstruction.remainingReplies ?? null
      }
    : null;
  const context = await loadGeminiConversationPayload(userId, conversationId, defaults, temporaryInstruction);
  if (!context) return null;
  const topicTerms = [
    topicState.primaryTopic?.topic,
    topicState.primaryTopic?.subtopic,
    ...topicState.secondaryTopics.flatMap((topic) => [topic.topic, topic.subtopic]),
    ...topicState.recentTopics.slice(0, 5).flatMap((topic) => [topic.topic, topic.subtopic])
  ].filter((value): value is string => Boolean(value));
  const rankedMemories = await retrievePersonalMemories(userId, {
    context: [normalizedMessage, ...new Set(topicTerms)].join("\n"),
    limit: 3
  });
  const personalMemories = rankedMemories.map(({ memory }) => ({
    id: memory.id,
    title: memory.structuredAnalysis.title,
    summary: memory.structuredAnalysis.summary,
    immutableFacts: memory.structuredAnalysis.immutableFacts,
    conversationHooks: memory.structuredAnalysis.conversationHooks
  }));
  const toTopic = (topic: { topic: string; subtopic?: string; confidence: number }) => ({
    topic: topic.topic,
    subtopic: topic.subtopic ?? null,
    confidence: topic.confidence
  });
  const topics = {
    primaryTopic: topicState.primaryTopic ? toTopic(topicState.primaryTopic) : null,
    secondaryTopics: topicState.secondaryTopics.slice(0, 5).map(toTopic),
    recentTopics: topicState.recentTopics.slice(0, 5).map(toTopic)
  };
  const recentMessages = conversation.messages
    .slice(-12)
    .map((message) => ({ direction: message.direction, text: message.text.slice(0, 1000) }));
  const generated = await provider({
    context,
    latestMessage: normalizedMessage,
    topics,
    ...(recentMessages.length ? { recentMessages } : {}),
    ...(personalMemories.length ? { personalMemories } : {}),
    ...(normalizedPreviewInstruction ? { previewInstruction: normalizedPreviewInstruction } : {})
  });
  const candidateIds = personalMemories.map((memory) => memory.id);
  const usedId = generated.usedPersonalMemoryId && candidateIds.includes(generated.usedPersonalMemoryId)
    ? generated.usedPersonalMemoryId
    : null;
  if (usedId) await markPersonalMemoriesUsed(userId, [usedId]);
  return {
    conversationId,
    ...generated,
    ...(usedId ? { usedPersonalMemoryId: usedId } : {}),
    provenance: {
      overriddenFields: context.provenance.overriddenFields.map(String),
      hasPersistentInstruction: context.provenance.hasPersistentInstruction,
      hasTemporaryInstruction: context.provenance.hasTemporaryInstruction,
      hasPreviewInstruction: Boolean(normalizedPreviewInstruction),
      personalMemoryCandidateIds: candidateIds,
      usedPersonalMemoryId: usedId
    }
  };
}
