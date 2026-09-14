import { getPool } from "./db-client.js";
import { buildConversationSyncHealth, type ConversationSyncHealth } from "./conversation-sync-health.js";

export const conversationManagementStates = [
  "unmanaged",
  "ai-managed",
  "manual",
  "moved-off-tinder",
  "archived"
] as const;

export type ConversationManagementState = (typeof conversationManagementStates)[number];
export type HumanActionBlockSeverity = "action-required" | "decision-required" | "urgent";

export interface HumanActionBlockSummary {
  blocked: boolean;
  pendingCount: number;
  highestSeverity: HumanActionBlockSeverity | null;
}

export interface ConversationManagementRecord {
  conversationId: string;
  externalThreadId: string;
  managementState: ConversationManagementState;
  explicitlySelected: boolean;
  selectedAt?: string;
  syncHealth: ConversationSyncHealth;
  humanActionBlock?: HumanActionBlockSummary;
  updatedAt: string;
}

export interface ConversationManagementUpdate {
  conversationId: string;
  managementState: ConversationManagementState;
}

export function isConversationManagementState(value: unknown): value is ConversationManagementState {
  return typeof value === "string" && conversationManagementStates.includes(value as ConversationManagementState);
}

interface ConversationManagementRow {
  id: string;
  external_thread_id: string;
  management_state: ConversationManagementState;
  management_selected_at: Date | null;
  sync_cursor_updated_at: Date | null;
  blocking_action_count?: number;
  highest_blocking_action_severity?: HumanActionBlockSeverity | null;
  updated_at: Date;
}

function managementRecord(row: ConversationManagementRow): ConversationManagementRecord {
  const pendingCount = row.blocking_action_count;
  return {
    conversationId: row.id,
    externalThreadId: row.external_thread_id,
    managementState: row.management_state,
    explicitlySelected: row.management_selected_at !== null,
    ...(row.management_selected_at ? { selectedAt: row.management_selected_at.toISOString() } : {}),
    syncHealth: buildConversationSyncHealth(row.sync_cursor_updated_at),
    ...(typeof pendingCount === "number" ? {
      humanActionBlock: {
        blocked: pendingCount > 0,
        pendingCount,
        highestSeverity: row.highest_blocking_action_severity ?? null
      }
    } : {}),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function listConversationManagement(
  userId: string
): Promise<ConversationManagementRecord[]> {
  const result = await getPool().query<ConversationManagementRow>(
    `SELECT c.id, c.external_thread_id, c.management_state, c.management_selected_at,
            c.sync_cursor_updated_at, c.updated_at,
            (
              SELECT COUNT(*)::int
                FROM human_actions ha
               WHERE ha.user_id = c.user_id
                 AND ha.conversation_ref = c.id::text
                 AND ha.status = 'pending'
                 AND ha.severity IN ('action-required', 'decision-required', 'urgent')
            ) AS blocking_action_count,
            (
              SELECT ha.severity
                FROM human_actions ha
               WHERE ha.user_id = c.user_id
                 AND ha.conversation_ref = c.id::text
                 AND ha.status = 'pending'
                 AND ha.severity IN ('action-required', 'decision-required', 'urgent')
               ORDER BY CASE ha.severity
                 WHEN 'urgent' THEN 0
                 WHEN 'decision-required' THEN 1
                 ELSE 2
               END,
               ha.created_at DESC
               LIMIT 1
            ) AS highest_blocking_action_severity
       FROM conversations c
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC`,
    [userId]
  );

  return result.rows.map(managementRecord);
}

export async function updateConversationManagement(
  userId: string,
  conversationId: string,
  managementState: ConversationManagementState
): Promise<ConversationManagementRecord | null> {
  const result = await getPool().query<ConversationManagementRow>(
    `UPDATE conversations
     SET management_state = $1,
         management_selected_at = now(),
         updated_at = now()
     WHERE id = $2 AND user_id = $3
     RETURNING id, external_thread_id, management_state, management_selected_at,
               sync_cursor_updated_at, updated_at`,
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
      const result = await client.query<ConversationManagementRow>(
        `UPDATE conversations
         SET management_state = $1,
             management_selected_at = now(),
             updated_at = now()
         WHERE id = $2 AND user_id = $3
         RETURNING id, external_thread_id, management_state, management_selected_at,
                   sync_cursor_updated_at, updated_at`,
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
