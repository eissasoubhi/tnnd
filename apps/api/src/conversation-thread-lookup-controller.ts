import { findConversationByExternalThreadId } from "./conversation-thread-lookup-service.js";

export interface ConversationThreadLookupControllerResult {
  status: 200 | 400 | 404;
  body: Record<string, unknown>;
}

export async function handleConversationThreadLookupRequest(
  userId: string,
  externalThreadIdValue: unknown
): Promise<ConversationThreadLookupControllerResult> {
  const externalThreadId = typeof externalThreadIdValue === "string" ? externalThreadIdValue.trim() : "";
  if (!externalThreadId || externalThreadId.length > 500) {
    return { status: 400, body: { error: "invalid_external_thread_id" } };
  }

  const conversation = await findConversationByExternalThreadId(userId, externalThreadId);
  if (!conversation) return { status: 404, body: { error: "conversation_not_found" } };
  return { status: 200, body: { conversation } };
}
