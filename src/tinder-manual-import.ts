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
  const messages: ConversationMessageDelta[] = rawMessages.map((message, index) => {
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
      // The source DOM has no verified sent time. Preserve *observed order*
      // deterministically instead of assigning the same timestamp to every
      // message (which caused the API's sort-by-time fallback to scramble it).
      sentAt: new Date(Date.parse(importedAt) + index).toISOString(),
      timestampVerified: false
    };
  });
  return {
    messages,
    nextCursor: messages[messages.length - 1].externalMessageId,
    requestedStatus: existingConversation ? null : "paused"
  };
}

/** Preserve every *rendered* message by sending ordered, API-sized batches.
 * This cannot prove Tinder loaded the beginning of the actual chat history.
 * Never truncate silently to the final 40 observed messages.
 */
export function prepareReadOnlyImportBatches(
  observed: readonly VisibleTinderMessage[],
  existingConversation: boolean,
  importedAt: string
): ReadOnlyImportPayload[] {
  if (observed.length > 1000) throw new Error("too_many_visible_messages_for_bounded_import");
  if (!observed.length) return [];
  if (!Number.isFinite(Date.parse(importedAt))) throw new Error("invalid_import_timestamp");
  const keys = new Set<string>();
  for (const m of observed) {
    if (m.direction !== "me" && m.direction !== "them"
      || !m.key?.trim() || m.key.length > 256 || !m.text?.trim() || m.text.length > 4000
      || keys.has(m.key)) throw new Error("invalid_visible_message");
    keys.add(m.key);
  }
  const batches: ReadOnlyImportPayload[] = [];
  for (let index = 0; index < observed.length; index += 40) {
    // Globally monotonic observed ordering across batches; never fabricate
    // a Tinder sent timestamp from these capture times.
    batches.push(prepareReadOnlyImport(
      observed.slice(index,index+40),
      existingConversation || index > 0,
      new Date(Date.parse(importedAt)+index).toISOString()
    ));
  }
  return batches;
}
