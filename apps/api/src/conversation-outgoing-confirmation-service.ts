import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export interface ConfirmOutgoingMessageInput {
  externalMessageId: string;
  text: string;
  sentAt: string;
}

export interface ConfirmOutgoingMessageResult {
  accepted: boolean;
  conversationId: string;
  externalMessageId: string;
  temporaryInstructionConsumed: boolean;
  temporaryInstructionScope: TemporaryInstructionScope | null;
  temporaryInstructionRemaining: number | null;
  humanActionResolved: boolean;
}

async function resolveDeliveredManualAnswer(
  client: { query: <T = unknown>(text: string, values?: readonly unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> },
  userId: string,
  conversationId: string,
  text: string
): Promise<boolean> {
  const resolved = await client.query<{ id: string }>(
    `WITH target AS (
       SELECT id
         FROM human_actions
        WHERE user_id = $1
          AND conversation_ref = $2
          AND status = 'pending'
          AND context_json->'manualAnswer'->>'deliveryState' = 'not-sent'
          AND context_json->'manualAnswer'->>'answer' = $3
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
     )
     UPDATE human_actions AS action
        SET status = 'completed',
            context_json = jsonb_set(action.context_json, '{manualAnswer,deliveryState}', '"sent"'::jsonb, true),
            updated_at = now(),
            resolved_at = now()
       FROM target
      WHERE action.id = target.id
      RETURNING action.id`,
    [userId, conversationId, text]
  );

  if (!resolved.rows[0]) return false;

  const pending = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM human_actions
        WHERE user_id = $1
          AND conversation_ref = $2
          AND status = 'pending'
          AND severity IN ('action-required', 'decision-required', 'urgent')
     ) AS exists`,
    [userId, conversationId]
  );

  if (!(pending.rows[0]?.exists ?? true)) {
    await client.query(
      `UPDATE conversations
          SET status = 'active', updated_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'action-required'`,
      [conversationId, userId]
    );
  }

  return true;
}

export async function confirmOutgoingMessage(
  userId: string,
  conversationId: string,
  input: ConfirmOutgoingMessageInput
): Promise<ConfirmOutgoingMessageResult | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const conversation = await client.query<{
      temporary_instruction_scope: TemporaryInstructionScope | null;
      temporary_instruction_remaining: number | null;
    }>(
      `SELECT temporary_instruction_scope, temporary_instruction_remaining
       FROM conversations
       WHERE id = $1 AND user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [conversationId, userId]
    );
    const row = conversation.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    const inserted = await client.query(
      `INSERT INTO conversation_messages (id, conversation_id, external_message_id, direction, body, sent_at)
       VALUES ($1, $2, $3, 'outgoing', $4, $5)
       ON CONFLICT (conversation_id, external_message_id) DO NOTHING
       RETURNING id`,
      [randomUUID(), conversationId, input.externalMessageId, input.text, input.sentAt]
    );

    const accepted = Boolean(inserted.rowCount);
    let temporaryInstructionConsumed = false;
    let temporaryInstructionScope = row.temporary_instruction_scope;
    let temporaryInstructionRemaining = row.temporary_instruction_remaining;
    let humanActionResolved = false;

    if (accepted) {
      humanActionResolved = await resolveDeliveredManualAnswer(client, userId, conversationId, input.text);
    }

    if (accepted && row.temporary_instruction_scope === "next-message") {
      await client.query(
        `UPDATE conversations
         SET temporary_instruction = NULL,
             temporary_instruction_scope = NULL,
             temporary_instruction_remaining = NULL,
             updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [conversationId, userId]
      );
      temporaryInstructionConsumed = true;
      temporaryInstructionScope = null;
      temporaryInstructionRemaining = null;
    } else if (accepted && row.temporary_instruction_scope === "next-n-replies" && row.temporary_instruction_remaining !== null) {
      const nextRemaining = row.temporary_instruction_remaining - 1;
      temporaryInstructionConsumed = true;
      if (nextRemaining <= 0) {
        await client.query(
          `UPDATE conversations
           SET temporary_instruction = NULL,
               temporary_instruction_scope = NULL,
               temporary_instruction_remaining = NULL,
               updated_at = now()
           WHERE id = $1 AND user_id = $2`,
          [conversationId, userId]
        );
        temporaryInstructionScope = null;
        temporaryInstructionRemaining = null;
      } else {
        await client.query(
          `UPDATE conversations
           SET temporary_instruction_remaining = $1,
               updated_at = now()
           WHERE id = $2 AND user_id = $3`,
          [nextRemaining, conversationId, userId]
        );
        temporaryInstructionScope = "next-n-replies";
        temporaryInstructionRemaining = nextRemaining;
      }
    } else if (accepted) {
      await client.query("UPDATE conversations SET updated_at = now() WHERE id = $1 AND user_id = $2", [conversationId, userId]);
    }

    await client.query("COMMIT");
    return {
      accepted,
      conversationId,
      externalMessageId: input.externalMessageId,
      temporaryInstructionConsumed,
      temporaryInstructionScope,
      temporaryInstructionRemaining,
      humanActionResolved
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
