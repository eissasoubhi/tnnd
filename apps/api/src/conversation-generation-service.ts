import { withGenerationStage } from "./conversation-generation-stage.js";
import { resolveReplyTarget } from "./conversation-reply-target.js";
import { loadAiProviderSettings } from "./ai-provider-settings-service.js";
import { listConversationFacts } from "./conversation-fact-service.js";
import { getConversation } from "./conversation-service.js";
import { getConversationSummary } from "./conversation-summary-service.js";
import { loadGeminiConversationPayload } from "./effective-conversation-context-service.js";
import {
  callGeminiConversationProvider,
  createGeminiConversationProvider,
  type GeminiConversationProvider,
  type GeminiGenerationResult
} from "./gemini-provider.js";
import { loadGenerationProfile } from "./generation-user-profile-context.js";
import { loadGenerationSupplementalContext } from "./generation-supplemental-context.js";
import { resolveAdaptiveStyle } from "./conversation-style-adaptation.js";
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
    adaptiveStyle: { effective: Record<string, unknown>; autoFields: string[]; reasons: Record<string, string> };
  };
}

export async function generateConversationReply(
  userId: string,
  conversationId: string,
  latestMessage: string,
  provider: GeminiConversationProvider = callGeminiConversationProvider,
  previewInstruction?: string
): Promise<ConversationGenerationResult | null> {
  const manualMessage = latestMessage.trim();
  if (manualMessage.length > 4000) throw new Error("invalid_generation_message");
  const normalizedPreviewInstruction = previewInstruction?.trim() ?? "";
  if (normalizedPreviewInstruction.length > 1000) throw new Error("invalid_preview_instruction");

  const [conversation, generationProfile, conversationSummary, durableFacts] = await Promise.all([
    withGenerationStage("conversation", () => getConversation(userId, conversationId)),
    withGenerationStage("profile", () => loadGenerationProfile(userId)),
    withGenerationStage("summary", () => getConversationSummary(conversationId)),
    withGenerationStage("facts", () => listConversationFacts(conversationId, 20))
  ]);
  if (!conversation) return null;
  // Single source of truth: resolve from the authenticated user's persisted
  // conversation, not an editable browser field. This is preview-only.
  const normalizedMessage = resolveReplyTarget(manualMessage, conversation.messages);
  if (normalizedMessage.length > 4000) throw new Error("invalid_generation_message");
  const topicState = conversation.topicState;

  const temporaryInstruction = conversation.temporaryInstruction
    ? {
        text: conversation.temporaryInstruction.text,
        scope: conversation.temporaryInstruction.scope,
        remainingReplies: conversation.temporaryInstruction.remainingReplies ?? null
      }
    : null;
  const [context, supplementalContext] = await Promise.all([
    withGenerationStage("effective-context", () => loadGeminiConversationPayload(userId, conversationId, generationProfile.defaults, temporaryInstruction)),
    withGenerationStage("supplemental", () => loadGenerationSupplementalContext(userId, conversationId, conversation.externalThreadId))
  ]);
  if (!context) return null;
  const topicTerms = [
    topicState.primaryTopic?.topic,
    topicState.primaryTopic?.subtopic,
    ...topicState.secondaryTopics.flatMap((topic) => [topic.topic, topic.subtopic]),
    ...topicState.recentTopics.slice(0, 5).flatMap((topic) => [topic.topic, topic.subtopic])
  ].filter((value): value is string => Boolean(value));
  const rankedMemories = await withGenerationStage("memories", () => retrievePersonalMemories(userId, {
    context: [normalizedMessage, ...new Set(topicTerms)].join("\n"),
    limit: 2
  }));
  const personalMemories = rankedMemories.map(({ memory }) => ({
    id: memory.id,
    title: memory.structuredAnalysis.title.slice(0, 120),
    summary: memory.structuredAnalysis.summary.slice(0, 500),
    immutableFacts: memory.structuredAnalysis.immutableFacts.slice(0, 6).map((fact) => fact.slice(0, 180)),
    conversationHooks: memory.structuredAnalysis.conversationHooks.slice(0, 4).map((hook) => hook.slice(0, 180))
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
  const conversationFacts = durableFacts.map((fact) => ({
    subject: fact.subject,
    key: fact.key,
    value: fact.value,
    confidence: fact.confidence
  }));
  const adaptive = resolveAdaptiveStyle(
    context.settings,
    generationProfile.userProfile?.textingStyle ?? {},
    recentMessages,
    normalizedMessage,
    context.provenance.overriddenFields,
    (generationProfile.userProfile?.languages ?? context.settings.languages ?? {}) as Partial<{fr:number;darija:number;en:number}>
  );
  const effectiveContext = { ...context, settings: adaptive.settings, instructions: [...context.instructions, ...(adaptive.autoFields.length ? [`Auto-adaptive fields: ${adaptive.autoFields.join(", ")}. Adapt around the saved style baseline, not by imitating the interlocutor. Keep jokes and teasing reciprocal and appropriate; return to the baseline when the mood lightens. ${adaptive.autoFields.includes("languages") ? "Mirror the interlocutor language naturally, treating language weights as soft guidance rather than word quotas; preserve the saved French, English and Darija writing styles." : "Honor the fixed or manually overridden language choices."} Double texting is only a style signal; produce exactly one draft and never send extra messages.`] : [])] };
  // Use the credentials/model saved in Settings → Gemini for this user.
  // The env-based provider remains a fallback for deployments with no user
  // configuration. Explicit injected test providers are never replaced.
  const savedProvider = provider === callGeminiConversationProvider
    ? await withGenerationStage("provider-settings", () => loadAiProviderSettings(userId))
    : null;
  const generate = savedProvider
    ? createGeminiConversationProvider(savedProvider)
    : provider;
  const generated = await withGenerationStage("provider", () => generate({
    context: effectiveContext,
    latestMessage: normalizedMessage,
    topics,
    ...(generationProfile.userProfile ? { userProfile: generationProfile.userProfile } : {}),
    ...(conversationSummary ? { conversationSummary: conversationSummary.summary } : {}),
    ...(recentMessages.length ? { recentMessages } : {}),
    ...(conversationFacts.length ? { conversationFacts } : {}),
    ...(supplementalContext.matchProfile ? { matchProfile: supplementalContext.matchProfile } : {}),
    ...(supplementalContext.humanActions.length ? { humanActions: supplementalContext.humanActions } : {}),
    ...(personalMemories.length ? { personalMemories } : {}),
    ...(normalizedPreviewInstruction ? { previewInstruction: normalizedPreviewInstruction } : {})
  }));
  const candidateIds = personalMemories.map((memory) => memory.id);
  const usedId = generated.usedPersonalMemoryId && candidateIds.includes(generated.usedPersonalMemoryId)
    ? generated.usedPersonalMemoryId
    : null;
  if (usedId) await withGenerationStage("memory-usage", () => markPersonalMemoriesUsed(userId, [usedId]));
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
      usedPersonalMemoryId: usedId,
      adaptiveStyle: {
        effective: Object.fromEntries(["messageLength", "directness", "teasingStyle", "humorLevel", "doubleTexting", "languages"].map(key => [key, (adaptive.settings as Record<string, unknown>)[key]])),
        autoFields: adaptive.autoFields,
        reasons: adaptive.reasons
      }
    }
  };
}
