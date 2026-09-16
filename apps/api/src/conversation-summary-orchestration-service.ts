import { getPool } from "./db-client.js";
import { callGeminiConversationSummaryProvider, type ConversationSummaryProvider } from "./conversation-summary-provider.js";
import { getConversationSummary, saveConversationSummary } from "./conversation-summary-service.js";

const MIN_UNSUMMARIZED_MESSAGES = 20;
const MAX_MESSAGES_PER_SUMMARY = 60;

interface MessageRow {
  direction: "incoming" | "outgoing";
  body: string;
  sent_at: Date;
}

export async function summarizeConversationIfNeeded(
  userId: string,
  conversationId: string,
  provider: ConversationSummaryProvider = callGeminiConversationSummaryProvider
): Promise<boolean> {
  const owner = await getPool().query<{ id: string }>(
    "SELECT id FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1",
    [conversationId, userId]
  );
  if (!owner.rows[0]) return false;

  const previous = await getConversationSummary(conversationId);
  const offset = previous?.summarizedMessageCount ?? 0;
  const countResult = await getPool().query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM conversation_messages WHERE conversation_id = $1",
    [conversationId]
  );
  const totalCount = Number(countResult.rows[0]?.count ?? 0);
  if (totalCount - offset < MIN_UNSUMMARIZED_MESSAGES) return false;

  const messagesResult = await getPool().query<MessageRow>(
    `SELECT direction, body, sent_at
       FROM conversation_messages
      WHERE conversation_id = $1
      ORDER BY sent_at ASC, created_at ASC
      OFFSET $2 LIMIT $3`,
    [conversationId, offset, MAX_MESSAGES_PER_SUMMARY]
  );
  if (!messagesResult.rows.length) return false;

  const summary = await provider({
    ...(previous?.summary ? { previousSummary: previous.summary } : {}),
    messages: messagesResult.rows.map((message) => ({ direction: message.direction, text: message.body.slice(0, 2000) }))
  });
  const lastMessage = messagesResult.rows[messagesResult.rows.length - 1]!;
  await saveConversationSummary({
    conversationId,
    summary,
    summarizedMessageCount: offset + messagesResult.rows.length,
    lastMessageAt: lastMessage.sent_at
  });
  return true;
}
