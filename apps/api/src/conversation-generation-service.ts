import { getConversation } from "./conversation-service.js";
import { getConversationSummary } from "./conversation-summary-service.js";
import { getConversationTopicState } from "./conversation-topic-service.js";
import { loadGeminiConversationPayload } from "./effective-conversation-context-service.js";
import {
  callGeminiConversationProvider,
  type GeminiConversationProvider,
  type GeminiGenerationResult
} from "./gemini-provider.js";
import { loadGenerationProfile } from "./generation-user-profile-context.js";
import { loadGenerationSupplementalContext } from "./generation-supplemental-context.js";
import { markPersonalMemoriesUsed, retrievePersonalMemories } from "./personal-memory-service.js";

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

  const [conversation, generationProfile, topicState, conversationSummary] = await Promise.all([
    getConversation(userId, conversationId),
    loadGenerationProfile(userId),
    getConversationTopicState(conversationId),
    getConversationSummary(conversationId)
  ]);
  if (!conversation) return null;

  const temporaryInstruction = conversation.temporaryInstruction
    ? {
        text: conversation.temporaryInstruction.text,
        scope: conversation.temporaryInstruction.scope,
        remainingReplies: conversation.temporaryInstruction.remainingReplies ?? null
      }
    : null;
  const [context, supplementalContext] = await Promise.all([
    loadGeminiConversationPayload(userId, conversationId, generationProfile.defaults, temporaryInstruction),
    loadGenerationSupplementalContext(userId, conversationId, conversation.externalThreadId)
  ]);
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
    ...(generationProfile.userProfile ? { userProfile: generationProfile.userProfile } : {}),
    ...(conversationSummary ? { conversationSummary: conversationSummary.summary } : {}),
    ...(recentMessages.length ? { recentMessages } : {}),
    ...(supplementalContext.matchProfile ? { matchProfile: supplementalContext.matchProfile } : {}),
    ...(supplementalContext.humanActions.length ? { humanActions: supplementalContext.humanActions } : {}),
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
