import { getPool } from "./db-client.js";
import type { ConversationManagementState } from "./conversation-management-service.js";
import type { ConversationStatus } from "./conversation-sync-contract.js";

export interface ConversationThreadLookup {
  id: string;
  externalThreadId: string;
  status: ConversationStatus;
  managementState: ConversationManagementState;
  explicitlySelected: boolean;
  syncCursor?: string;
  syncCursorUpdatedAt?: string;
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
    management_state: ConversationManagementState;
    management_selected_at: Date | null;
    sync_cursor: string | null;
    sync_cursor_updated_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT id, external_thread_id, status, management_state, management_selected_at,
            sync_cursor, sync_cursor_updated_at, updated_at
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
    managementState: row.management_state,
    explicitlySelected: row.management_selected_at !== null,
    ...(row.sync_cursor ? { syncCursor: row.sync_cursor } : {}),
    ...(row.sync_cursor_updated_at ? { syncCursorUpdatedAt: row.sync_cursor_updated_at.toISOString() } : {}),
    updatedAt: row.updated_at.toISOString()
  };
}
