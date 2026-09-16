import { analyzeConversationFacts } from "./conversation-fact-gemini-provider.js";
import { upsertConversationFacts } from "./conversation-fact-service.js";
import { getPool } from "./db-client.js";

interface FactAnalysisCursor {
  createdAt: Date;
  messageId: string;
}

interface FactMessageRow {
  id: string;
  direction: "incoming" | "outgoing";
  body: string;
  created_at: Date;
}

async function loadCursor(conversationId: string): Promise<FactAnalysisCursor | null> {
  const result = await getPool().query<{
    last_processed_created_at: Date;
    last_processed_message_id: string;
  }>(
    `SELECT last_processed_created_at, last_processed_message_id
     FROM conversation_fact_analysis_state
     WHERE conversation_id = $1
     LIMIT 1`,
    [conversationId]
  );
  const row = result.rows[0];
  return row ? { createdAt: row.last_processed_created_at, messageId: row.last_processed_message_id } : null;
}

async function loadMessages(userId: string, conversationId: string, cursor: FactAnalysisCursor | null): Promise<FactMessageRow[]> {
  if (cursor) {
    const result = await getPool().query<FactMessageRow>(
      `SELECT m.id, m.direction, m.body, m.created_at
       FROM conversation_messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.id = $1 AND c.user_id = $2
         AND (m.created_at, m.id) > ($3, $4::uuid)
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT 30`,
      [conversationId, userId, cursor.createdAt, cursor.messageId]
    );
    return result.rows;
  }
  const result = await getPool().query<FactMessageRow>(
    `SELECT m.id, m.direction, m.body, m.created_at
     FROM conversation_messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.id = $1 AND c.user_id = $2
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 30`,
    [conversationId, userId]
  );
  return result.rows.reverse();
}

async function saveCursor(conversationId: string, cursor: FactAnalysisCursor): Promise<void> {
  await getPool().query(
    `INSERT INTO conversation_fact_analysis_state
       (conversation_id, last_processed_created_at, last_processed_message_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id) DO UPDATE
     SET last_processed_created_at = EXCLUDED.last_processed_created_at,
         last_processed_message_id = EXCLUDED.last_processed_message_id,
         updated_at = now()`,
    [conversationId, cursor.createdAt, cursor.messageId]
  );
}

export async function analyzeAndRecordConversationFacts(userId: string, conversationId: string): Promise<number> {
  const cursor = await loadCursor(conversationId);
  const messages = await loadMessages(userId, conversationId, cursor);
  if (!messages.length) return 0;
  const facts = await analyzeConversationFacts(messages.map((message) => ({
    id: message.id,
    direction: message.direction,
    text: message.body
  })));
  if (facts.length) await upsertConversationFacts(conversationId, facts);
  const last = messages[messages.length - 1];
  await saveCursor(conversationId, { createdAt: last.created_at, messageId: last.id });
  return facts.length;
}
