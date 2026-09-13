import { getPool } from "./db-client.js";
import type { ConversationStatus } from "./conversation-sync-contract.js";

export interface ConversationThreadLookup {
  id: string;
  externalThreadId: string;
  status: ConversationStatus;
  updatedAt: string;
}

export async function findConversationByExternalThreadId(
  userId: string,
  externalThreadId: string
): Promise<ConversationThreadLookup | null> {
  const result = await getPool().query<{
    id: string;
    external_thread_id: string;
    status: ConversationStatus;
    updated_at: Date;
  }>(
    `SELECT id, external_thread_id, status, updated_at
     FROM conversations
     WHERE user_id = $1 AND external_thread_id = $2
     LIMIT 1`,
    [userId, externalThreadId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    externalThreadId: row.external_thread_id,
    status: row.status,
    updatedAt: row.updated_at.toISOString()
  };
}
