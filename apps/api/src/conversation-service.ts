import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";
import type { ConversationSyncRequest, ConversationSyncResponse, ConversationStatus } from "./conversation-sync-contract.js";

export interface ConversationSummary {
  id: string;
  externalThreadId: string;
  status: ConversationStatus;
  currentTopic?: string;
  updatedAt: string;
}

export async function syncConversation(userId: string, input: ConversationSyncRequest): Promise<ConversationSyncResponse> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ id: string; status: ConversationStatus }>(
      `SELECT id, status FROM conversations
       WHERE user_id = $1 AND external_thread_id = $2
       LIMIT 1 FOR UPDATE`,
      [userId, input.externalThreadId]
    );
    let conversationId = existing.rows[0]?.id;
    let status: ConversationStatus = existing.rows[0]?.status ?? "active";
    if (!conversationId) {
      conversationId = randomUUID();
      await client.query(
        `INSERT INTO conversations (id, user_id, external_thread_id, status)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, userId, input.externalThreadId, status]
      );
    }

    const acceptedMessageIds: string[] = [];
    for (const message of input.messages) {
      const result = await client.query(
        `INSERT INTO conversation_messages (id, conversation_id, external_message_id, direction, body, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (conversation_id, external_message_id) DO NOTHING
         RETURNING external_message_id`,
        [randomUUID(), conversationId, message.externalMessageId, message.direction, message.text, message.sentAt]
      );
      if (result.rowCount) acceptedMessageIds.push(message.externalMessageId);
    }

    await client.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversationId]);
    await client.query("COMMIT");
    const serverTime = new Date().toISOString();
    return { conversationId, status, acceptedMessageIds, nextCursor: serverTime, serverTime };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const result = await getPool().query<{
    id: string;
    external_thread_id: string;
    status: ConversationStatus;
    current_topic: string | null;
    updated_at: Date;
  }>(
    `SELECT id, external_thread_id, status, current_topic, updated_at
     FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    externalThreadId: row.external_thread_id,
    status: row.status,
    ...(row.current_topic ? { currentTopic: row.current_topic } : {}),
    updatedAt: row.updated_at.toISOString()
  }));
}
