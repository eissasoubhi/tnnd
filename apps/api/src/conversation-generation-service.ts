import { getConversation } from "./conversation-service.js";
import { validateConversationOverrides, type ConversationOverrides } from "./conversation-overrides.js";
import { getPool } from "./db-client.js";
import { loadGeminiConversationPayload } from "./effective-conversation-context-service.js";
import {
  callGeminiConversationProvider,
  type GeminiConversationProvider,
  type GeminiGenerationResult
} from "./gemini-provider.js";

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
  };
}

export async function generateConversationReply(
  userId: string,
  conversationId: string,
  latestMessage: string,
  provider: GeminiConversationProvider = callGeminiConversationProvider
): Promise<ConversationGenerationResult | null> {
  const normalizedMessage = latestMessage.trim();
  if (!normalizedMessage || normalizedMessage.length > 4000) throw new Error("invalid_generation_message");

  const [conversation, defaults] = await Promise.all([
    getConversation(userId, conversationId),
    loadGlobalDefaults(userId)
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
  const generated = await provider({ context, latestMessage: normalizedMessage });
  return {
    conversationId,
    ...generated,
    provenance: {
      overriddenFields: context.provenance.overriddenFields.map(String),
      hasPersistentInstruction: context.provenance.hasPersistentInstruction,
      hasTemporaryInstruction: context.provenance.hasTemporaryInstruction
    }
  };
}
