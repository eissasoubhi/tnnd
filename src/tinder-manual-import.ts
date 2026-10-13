import type { ConversationMessageDelta, ConversationStatus } from "./conversation-sync";

export interface VisibleTinderMessage {
  key: string;
  direction: "me" | "them";
  text: string;
}

export interface ReadOnlyImportPayload {
  messages: ConversationMessageDelta[];
  nextCursor: string;
  requestedStatus: ConversationStatus | null;
}

/**
 * A one-shot user-authorized read-only import. Existing statuses are retained;
 * new threads start paused, and AI management remains independently disabled.
 * Tinder's actual message timestamps are not available from the current
 * observed selectors: importedAt is a capture timestamp, not sent time.
 */
export function prepareReadOnlyImport(
  rawMessages: readonly VisibleTinderMessage[],
  existingConversation: boolean,
  importedAt: string
): ReadOnlyImportPayload {
  if (!Number.isFinite(Date.parse(importedAt))) throw new Error("invalid_import_timestamp");
  if (!rawMessages.length || rawMessages.length > 40) throw new Error("invalid_message_count");
  const unique = new Set<string>();
  const messages: ConversationMessageDelta[] = rawMessages.map(message => {
    if (message.direction !== "me" && message.direction !== "them") throw new Error("unknown_message_direction");
    const key = message.key.trim();
    const text = message.text.trim();
    if (!key || key.length > 256 || !text || text.length > 4000 || unique.has(key)) {
      throw new Error("invalid_visible_message");
    }
    unique.add(key);
    return {
      externalMessageId: key,
      direction: message.direction === "me" ? "outgoing" : "incoming",
      text,
      sentAt: importedAt
    };
  });
  return {
    messages,
    nextCursor: messages[messages.length - 1].externalMessageId,
    requestedStatus: existingConversation ? null : "paused"
  };
}
