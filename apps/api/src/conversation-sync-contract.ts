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

export const CONVERSATION_SYNC_LIMITS = {
  maxMessages: 40,
  maxThreadIdLength: 512,
  maxConversationIdLength: 128,
  maxCursorLength: 512,
  maxExternalMessageIdLength: 256,
  maxMessageTextLength: 4000,
} as const;

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
  status?: ConversationStatus;
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

function requireBoundedString(value: unknown, field: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${field} is required`);
  if (value.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`);
  return allowEmpty ? value : normalized;
}

export function validateConversationSyncRequest(value: unknown): ConversationSyncRequest {
  if (!value || typeof value !== "object") throw new Error("Sync payload must be an object");
  const input = value as Record<string, unknown>;
  const externalThreadId = requireBoundedString(
    input.externalThreadId,
    "externalThreadId",
    CONVERSATION_SYNC_LIMITS.maxThreadIdLength
  );

  if (input.knownConversationId !== undefined) {
    requireBoundedString(input.knownConversationId, "knownConversationId", CONVERSATION_SYNC_LIMITS.maxConversationIdLength);
  }
  if (input.cursor !== undefined) {
    requireBoundedString(input.cursor, "cursor", CONVERSATION_SYNC_LIMITS.maxCursorLength, true);
  }
  if (input.status !== undefined && !isConversationStatus(input.status)) {
    throw new Error("status is invalid");
  }
  if (!Array.isArray(input.messages)) throw new Error("messages must be an array");
  if (input.messages.length > CONVERSATION_SYNC_LIMITS.maxMessages) {
    throw new Error(`messages exceeds ${CONVERSATION_SYNC_LIMITS.maxMessages} items`);
  }

  const seenMessageIds = new Set<string>();
  const messages = input.messages.map((message, index): ConversationMessageDelta => {
    if (!message || typeof message !== "object") throw new Error(`messages[${index}] must be an object`);
    const item = message as Record<string, unknown>;
    const externalMessageId = requireBoundedString(
      item.externalMessageId,
      `messages[${index}].externalMessageId`,
      CONVERSATION_SYNC_LIMITS.maxExternalMessageIdLength
    );
    if (seenMessageIds.has(externalMessageId)) {
      throw new Error(`messages[${index}].externalMessageId is duplicated`);
    }
    seenMessageIds.add(externalMessageId);
    if (item.direction !== "incoming" && item.direction !== "outgoing") {
      throw new Error(`messages[${index}].direction is invalid`);
    }
    if (typeof item.text !== "string") throw new Error(`messages[${index}].text must be a string`);
    if (item.text.length > CONVERSATION_SYNC_LIMITS.maxMessageTextLength) {
      throw new Error(`messages[${index}].text exceeds ${CONVERSATION_SYNC_LIMITS.maxMessageTextLength} characters`);
    }
    if (typeof item.sentAt !== "string" || Number.isNaN(Date.parse(item.sentAt))) {
      throw new Error(`messages[${index}].sentAt must be an ISO date`);
    }
    return {
      externalMessageId,
      direction: item.direction,
      text: item.text,
      sentAt: item.sentAt,
    };
  });

  return {
    externalThreadId,
    ...(typeof input.knownConversationId === "string" ? { knownConversationId: input.knownConversationId.trim() } : {}),
    ...(typeof input.cursor === "string" ? { cursor: input.cursor } : {}),
    ...(isConversationStatus(input.status) ? { status: input.status } : {}),
    messages,
  };
}
