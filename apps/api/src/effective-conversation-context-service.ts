import { getConversationOverrides } from "./conversation-overrides-service.js";
import {
  buildEffectiveConversationContext,
  type EffectiveConversationContext,
  type GlobalConversationDefaults,
  type TemporaryConversationInstruction
} from "./effective-conversation-context.js";
import { buildGeminiConversationPayload, type GeminiConversationPayload } from "./gemini-conversation-payload.js";

export interface PersistedEffectiveConversationContext extends EffectiveConversationContext {
  conversationId: string;
}

export interface PersistedGeminiConversationPayload extends GeminiConversationPayload {
  conversationId: string;
}

export async function loadEffectiveConversationContext(
  userId: string,
  conversationId: string,
  defaults: GlobalConversationDefaults,
  temporaryInstruction: TemporaryConversationInstruction | null = null
): Promise<PersistedEffectiveConversationContext | null> {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) return null;

  const overrides = await getConversationOverrides(userId, normalizedConversationId);
  if (overrides === null) return null;

  return {
    conversationId: normalizedConversationId,
    ...buildEffectiveConversationContext(defaults, overrides, temporaryInstruction)
  };
}

export async function loadGeminiConversationPayload(
  userId: string,
  conversationId: string,
  defaults: GlobalConversationDefaults,
  temporaryInstruction: TemporaryConversationInstruction | null = null
): Promise<PersistedGeminiConversationPayload | null> {
  const context = await loadEffectiveConversationContext(userId, conversationId, defaults, temporaryInstruction);
  if (!context) return null;
  return {
    conversationId: context.conversationId,
    ...buildGeminiConversationPayload(context)
  };
}
