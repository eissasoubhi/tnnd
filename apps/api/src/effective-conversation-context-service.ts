import { getConversationOverrides } from "./conversation-overrides-service.js";
import {
  buildEffectiveConversationContext,
  type EffectiveConversationContext,
  type GlobalConversationDefaults,
  type TemporaryConversationInstruction
} from "./effective-conversation-context.js";

export interface PersistedEffectiveConversationContext extends EffectiveConversationContext {
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
