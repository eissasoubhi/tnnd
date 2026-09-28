import type { QueryResultRow } from "pg";
import { getPool } from "./db-client.js";

export type PrivacyDeleteQuery = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[]
) => Promise<{ rows: T[]; rowCount: number | null }>;

function defaultQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[]
) {
  return getPool().query<T>(text, values);
}

function normalizedId(value: string): string {
  return value.trim();
}

/**
 * Deletes one user-owned conversation and its durable conversation data.
 * Foreign-key cascades remove messages, match profile, topics, summaries and facts.
 * Human actions use a text reference rather than a foreign key, so they are removed
 * explicitly in the same SQL statement.
 */
export async function deleteConversationData(
  userId: string,
  conversationId: string,
  query: PrivacyDeleteQuery = defaultQuery
): Promise<boolean> {
  const ownerId = normalizedId(userId);
  const id = normalizedId(conversationId);
  if (!ownerId || !id) return false;

  const result = await query<{ id: string }>(
    `WITH target AS (
       SELECT id, external_thread_id
       FROM conversations
       WHERE user_id = $1 AND id = $2
     ),
     deleted_actions AS (
       DELETE FROM human_actions
       WHERE user_id = $1
         AND conversation_ref IN (
           SELECT id::text FROM target
           UNION ALL
           SELECT external_thread_id FROM target
         )
     )
     DELETE FROM conversations
     WHERE user_id = $1
       AND id IN (SELECT id FROM target)
     RETURNING id`,
    [ownerId, id]
  );

  return Boolean(result.rowCount);
}

export async function deleteMatchProfileData(
  userId: string,
  matchProfileId: string,
  query: PrivacyDeleteQuery = defaultQuery
): Promise<boolean> {
  const ownerId = normalizedId(userId);
  const id = normalizedId(matchProfileId);
  if (!ownerId || !id) return false;

  const result = await query(
    "DELETE FROM match_profiles WHERE user_id = $1 AND id = $2",
    [ownerId, id]
  );
  return Boolean(result.rowCount);
}
