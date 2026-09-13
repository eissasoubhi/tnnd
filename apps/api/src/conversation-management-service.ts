import { getPool } from "./db-client.js";

export const conversationManagementStates = [
  "unmanaged",
  "ai-managed",
  "manual",
  "moved-off-tinder",
  "archived"
] as const;

export type ConversationManagementState = (typeof conversationManagementStates)[number];

export interface ConversationManagementRecord {
  conversationId: string;
  externalThreadId: string;
  managementState: ConversationManagementState;
  explicitlySelected: boolean;
  selectedAt?: string;
  updatedAt: string;
}

export interface ConversationManagementUpdate {
  conversationId: string;
  managementState: ConversationManagementState;
}

export function isConversationManagementState(value: unknown): value is ConversationManagementState {
  return typeof value === "string" && conversationManagementStates.includes(value as ConversationManagementState);
}

function managementRecord(row: {
  id: string;
  external_thread_id: string;
  management_state: ConversationManagementState;
  management_selected_at: Date | null;
  updated_at: Date;
}): ConversationManagementRecord {
  return {
    conversationId: row.id,
    externalThreadId: row.external_thread_id,
    managementState: row.management_state,
    explicitlySelected: row.management_selected_at !== null,
    ...(row.management_selected_at ? { selectedAt: row.management_selected_at.toISOString() } : {}),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function listConversationManagement(
  userId: string
): Promise<ConversationManagementRecord[]> {
  const result = await getPool().query<{
    id: string;
    external_thread_id: string;
    management_state: ConversationManagementState;
    management_selected_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT id, external_thread_id, management_state, management_selected_at, updated_at
     FROM conversations
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  return result.rows.map(managementRecord);
}

export async function updateConversationManagement(
  userId: string,
  conversationId: string,
  managementState: ConversationManagementState
): Promise<ConversationManagementRecord | null> {
  const result = await getPool().query<{
    id: string;
    external_thread_id: string;
    management_state: ConversationManagementState;
    management_selected_at: Date | null;
    updated_at: Date;
  }>(
    `UPDATE conversations
     SET management_state = $1,
         management_selected_at = now(),
         updated_at = now()
     WHERE id = $2 AND user_id = $3
     RETURNING id, external_thread_id, management_state, management_selected_at, updated_at`,
    [managementState, conversationId, userId]
  );

  const row = result.rows[0];
  return row ? managementRecord(row) : null;
}

export async function bulkUpdateConversationManagement(
  userId: string,
  updates: readonly ConversationManagementUpdate[]
): Promise<ConversationManagementRecord[] | null> {
  if (updates.length < 1 || updates.length > 100) {
    throw new Error("conversation_management_bulk_size_invalid");
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const records: ConversationManagementRecord[] = [];

    for (const update of updates) {
      const result = await client.query<{
        id: string;
        external_thread_id: string;
        management_state: ConversationManagementState;
        management_selected_at: Date | null;
        updated_at: Date;
      }>(
        `UPDATE conversations
         SET management_state = $1,
             management_selected_at = now(),
             updated_at = now()
         WHERE id = $2 AND user_id = $3
         RETURNING id, external_thread_id, management_state, management_selected_at, updated_at`,
        [update.managementState, update.conversationId, userId]
      );

      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      records.push(managementRecord(row));
    }

    await client.query("COMMIT");
    return records;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
