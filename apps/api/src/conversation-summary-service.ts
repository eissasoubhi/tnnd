import { getPool } from "./db-client.js";

export interface ConversationSummary {
  conversationId: string;
  summary: string;
  summarizedMessageCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
}

interface SummaryRow {
  conversation_id: string;
  summary: string;
  summarized_message_count: number;
  last_message_at: Date | null;
  updated_at: Date;
}

function mapSummary(row: SummaryRow): ConversationSummary {
  return {
    conversationId: row.conversation_id,
    summary: row.summary,
    summarizedMessageCount: row.summarized_message_count,
    lastMessageAt: row.last_message_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString()
  };
}

export async function getConversationSummary(conversationId: string): Promise<ConversationSummary | null> {
  const result = await getPool().query<SummaryRow>(
    `SELECT conversation_id, summary, summarized_message_count, last_message_at, updated_at
       FROM conversation_summaries
      WHERE conversation_id = $1
      LIMIT 1`,
    [conversationId]
  );
  return result.rows[0] ? mapSummary(result.rows[0]) : null;
}

export async function saveConversationSummary(input: {
  conversationId: string;
  summary: string;
  summarizedMessageCount: number;
  lastMessageAt?: Date | null;
}): Promise<ConversationSummary> {
  const summary = input.summary.trim();
  if (!summary || summary.length > 12000) throw new Error("invalid_conversation_summary");
  if (!Number.isInteger(input.summarizedMessageCount) || input.summarizedMessageCount < 0) {
    throw new Error("invalid_summarized_message_count");
  }
  const result = await getPool().query<SummaryRow>(
    `INSERT INTO conversation_summaries (
       conversation_id, summary, summarized_message_count, last_message_at, updated_at
     ) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (conversation_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       summarized_message_count = EXCLUDED.summarized_message_count,
       last_message_at = EXCLUDED.last_message_at,
       updated_at = now()
     RETURNING conversation_id, summary, summarized_message_count, last_message_at, updated_at`,
    [input.conversationId, summary, input.summarizedMessageCount, input.lastMessageAt ?? null]
  );
  return mapSummary(result.rows[0]!);
}
