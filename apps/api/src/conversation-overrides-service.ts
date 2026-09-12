import { getPool } from "./db-client.js";
import { validateConversationOverrides, type ConversationOverrides } from "./conversation-overrides.js";

export async function getConversationOverrides(userId: string, conversationId: string): Promise<ConversationOverrides | null> {
  const result = await getPool().query<{ config_overrides: unknown }>(
    `SELECT config_overrides
     FROM conversations
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [conversationId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return validateConversationOverrides(row.config_overrides ?? {});
}

export async function replaceConversationOverrides(
  userId: string,
  conversationId: string,
  value: unknown
): Promise<ConversationOverrides | null> {
  const overrides = validateConversationOverrides(value);
  const result = await getPool().query<{ config_overrides: unknown }>(
    `UPDATE conversations
     SET config_overrides = $1::jsonb,
         updated_at = now()
     WHERE id = $2 AND user_id = $3
     RETURNING config_overrides`,
    [JSON.stringify(overrides), conversationId, userId]
  );
  const row = result.rows[0];
  return row ? validateConversationOverrides(row.config_overrides ?? {}) : null;
}

export async function clearConversationOverrides(userId: string, conversationId: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE conversations
     SET config_overrides = '{}'::jsonb,
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return Boolean(result.rowCount);
}
