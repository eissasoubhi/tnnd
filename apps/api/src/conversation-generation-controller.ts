import {
  generateConversationReply,
  type ConversationGenerationResult
} from "./conversation-generation-service.js";
import type { GeminiConversationProvider } from "./gemini-provider.js";

export interface ConversationGenerationRequest {
  latestMessage: string;
}

export type ConversationGenerationControllerResult =
  | { status: 200; body: { generation: ConversationGenerationResult } }
  | { status: 400; body: { error: "invalid_generation_request"; details: string } }
  | { status: 404; body: { error: "conversation_not_found" } };

export function validateConversationGenerationRequest(value: unknown): ConversationGenerationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("generation_body_must_be_object");
  }
  const latestMessage = (value as { latestMessage?: unknown }).latestMessage;
  if (typeof latestMessage !== "string") throw new Error("latest_message_must_be_string");
  const normalized = latestMessage.trim();
  if (!normalized) throw new Error("latest_message_required");
  if (normalized.length > 4000) throw new Error("latest_message_too_long");
  return { latestMessage: normalized };
}

export async function handleConversationGenerationRequest(
  userId: string,
  conversationId: string,
  value: unknown,
  provider?: GeminiConversationProvider
): Promise<ConversationGenerationControllerResult> {
  let request: ConversationGenerationRequest;
  try {
    request = validateConversationGenerationRequest(value);
  } catch (error) {
    return {
      status: 400,
      body: {
        error: "invalid_generation_request",
        details: error instanceof Error ? error.message : "invalid_generation_request"
      }
    };
  }

  const generation = await generateConversationReply(
    userId,
    conversationId,
    request.latestMessage,
    provider
  );
  if (!generation) return { status: 404, body: { error: "conversation_not_found" } };
  return { status: 200, body: { generation } };
}
