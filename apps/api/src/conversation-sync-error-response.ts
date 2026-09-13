import { ConversationThreadBusyError } from "./conversation-service.js";

export interface ConversationSyncErrorResponse {
  status: number;
  body: {
    error: "conversation_thread_busy" | "invalid_conversation_sync";
    retryable: boolean;
    retryAfterMs?: number;
    details?: string;
  };
}

export function conversationSyncErrorResponse(error: unknown): ConversationSyncErrorResponse {
  if (error instanceof ConversationThreadBusyError) {
    return {
      status: 409,
      body: {
        error: "conversation_thread_busy",
        retryable: true,
        retryAfterMs: 750
      }
    };
  }

  const details = error instanceof Error ? error.message : "invalid_conversation_sync";
  return {
    status: 400,
    body: {
      error: "invalid_conversation_sync",
      retryable: false,
      details
    }
  };
}
