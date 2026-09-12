export const CONVERSATION_STATUSES = [
  "active",
  "paused",
  "disabled",
  "waiting-for-them",
  "waiting-for-user",
  "action-required",
  "moved-off-tinder",
  "stale",
  "archived",
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export interface ConversationMessageDelta {
  externalMessageId: string;
  direction: "incoming" | "outgoing";
  text: string;
  sentAt: string;
}

export interface ConversationSyncRequest {
  externalThreadId: string;
  knownConversationId?: string;
  cursor?: string;
  messages: ConversationMessageDelta[];
}

export interface ConversationSyncResponse {
  conversationId: string;
  status: ConversationStatus;
  acceptedMessageIds: string[];
  nextCursor: string;
  serverTime: string;
}

export function isConversationStatus(value: unknown): value is ConversationStatus {
  return typeof value === "string" && (CONVERSATION_STATUSES as readonly string[]).includes(value);
}

export function validateConversationSyncRequest(value: unknown): ConversationSyncRequest {
  if (!value || typeof value !== "object") throw new Error("Sync payload must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.externalThreadId !== "string" || !input.externalThreadId.trim()) {
    throw new Error("externalThreadId is required");
  }
  if (input.knownConversationId !== undefined && typeof input.knownConversationId !== "string") {
    throw new Error("knownConversationId must be a string");
  }
  if (input.cursor !== undefined && typeof input.cursor !== "string") {
    throw new Error("cursor must be a string");
  }
  if (!Array.isArray(input.messages)) throw new Error("messages must be an array");

  const messages = input.messages.map((message, index): ConversationMessageDelta => {
    if (!message || typeof message !== "object") throw new Error(`messages[${index}] must be an object`);
    const item = message as Record<string, unknown>;
    if (typeof item.externalMessageId !== "string" || !item.externalMessageId.trim()) {
      throw new Error(`messages[${index}].externalMessageId is required`);
    }
    if (item.direction !== "incoming" && item.direction !== "outgoing") {
      throw new Error(`messages[${index}].direction is invalid`);
    }
    if (typeof item.text !== "string") throw new Error(`messages[${index}].text must be a string`);
    if (typeof item.sentAt !== "string" || Number.isNaN(Date.parse(item.sentAt))) {
      throw new Error(`messages[${index}].sentAt must be an ISO date`);
    }
    return {
      externalMessageId: item.externalMessageId,
      direction: item.direction,
      text: item.text,
      sentAt: item.sentAt,
    };
  });

  return {
    externalThreadId: input.externalThreadId,
    ...(typeof input.knownConversationId === "string" ? { knownConversationId: input.knownConversationId } : {}),
    ...(typeof input.cursor === "string" ? { cursor: input.cursor } : {}),
    messages,
  };
}
