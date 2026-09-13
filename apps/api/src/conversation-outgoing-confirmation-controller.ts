import { confirmOutgoingMessage } from "./conversation-outgoing-confirmation-service.js";

export interface OutgoingConfirmationControllerResult {
  status: 200 | 400 | 404;
  body: Record<string, unknown>;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleOutgoingConfirmationRequest(
  userId: string,
  conversationId: string,
  body: Record<string, unknown>
): Promise<OutgoingConfirmationControllerResult> {
  const externalMessageId = stringField(body.externalMessageId);
  const text = stringField(body.text);
  const sentAt = stringField(body.sentAt);
  const parsedSentAt = Date.parse(sentAt);

  if (!externalMessageId || externalMessageId.length > 500 || !text || text.length > 4000 || !sentAt || Number.isNaN(parsedSentAt)) {
    return { status: 400, body: { error: "invalid_outgoing_confirmation" } };
  }

  const confirmation = await confirmOutgoingMessage(userId, conversationId, {
    externalMessageId,
    text,
    sentAt: new Date(parsedSentAt).toISOString()
  });
  if (!confirmation) return { status: 404, body: { error: "conversation_not_found" } };
  return { status: 200, body: { confirmation } };
}
