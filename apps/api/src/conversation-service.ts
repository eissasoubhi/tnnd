import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";
import type { ConversationSyncRequest, ConversationSyncResponse, ConversationStatus } from "./conversation-sync-contract.js";

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export interface TemporaryInstruction {
  text: string;
  scope: TemporaryInstructionScope;
  remainingReplies?: number;
}

export interface ConversationSummary {
  id: string;
  externalThreadId: string;
  status: ConversationStatus;
  currentTopic?: string;
  lastMessageAt?: string;
  pendingHumanActions?: number;
  updatedAt: string;
}

export interface ConversationMessageRecord {
  id: string;
  direction: "incoming" | "outgoing";
  text: string;
  sentAt: string;
}

export interface ConversationDetailRecord extends ConversationSummary {
  messages: ConversationMessageRecord[];
  temporaryInstruction?: TemporaryInstruction;
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
    const status: ConversationStatus = input.status ?? existing.rows[0]?.status ?? "active";
    if (!conversationId) {
      conversationId = randomUUID();
      await client.query(
        `INSERT INTO conversations (id, user_id, external_thread_id, status)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, userId, input.externalThreadId, status]
      );
    } else if (input.status && input.status !== existing.rows[0]?.status) {
      await client.query(
        "UPDATE conversations SET status = $1, updated_at = now() WHERE id = $2 AND user_id = $3",
        [input.status, conversationId, userId]
      );
    }

    const acceptedMessageIds: string[] = [];
    let acceptedOutgoingCount = 0;
    for (const message of input.messages) {
      const result = await client.query(
        `INSERT INTO conversation_messages (id, conversation_id, external_message_id, direction, body, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (conversation_id, external_message_id) DO NOTHING
         RETURNING external_message_id`,
        [randomUUID(), conversationId, message.externalMessageId, message.direction, message.text, message.sentAt]
      );
      if (result.rowCount) {
        acceptedMessageIds.push(message.externalMessageId);
        if (message.direction === "outgoing") acceptedOutgoingCount += 1;
      }
    }

    if (acceptedOutgoingCount > 0) {
      await client.query(
        `UPDATE conversations
         SET temporary_instruction = CASE
               WHEN temporary_instruction_remaining <= $1 THEN NULL
               ELSE temporary_instruction
             END,
             temporary_instruction_scope = CASE
               WHEN temporary_instruction_remaining <= $1 THEN NULL
               ELSE temporary_instruction_scope
             END,
             temporary_instruction_remaining = CASE
               WHEN temporary_instruction_remaining <= $1 THEN NULL
               ELSE temporary_instruction_remaining - $1
             END,
             updated_at = now()
         WHERE id = $2 AND user_id = $3
           AND temporary_instruction_scope IN ('next-message', 'next-n-replies')
           AND temporary_instruction_remaining IS NOT NULL`,
        [acceptedOutgoingCount, conversationId, userId]
      );
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
    last_message_at: Date | null;
    pending_human_actions: string | number;
    updated_at: Date;
  }>(
    `SELECT c.id, c.external_thread_id, c.status, c.current_topic, c.updated_at,
            MAX(m.sent_at) AS last_message_at,
            (
              SELECT COUNT(*)
              FROM human_actions h
              WHERE h.user_id = c.user_id
                AND h.status = 'pending'
                AND (h.conversation_ref = c.id::text OR h.conversation_ref = c.external_thread_id)
            ) AS pending_human_actions
     FROM conversations c
     LEFT JOIN conversation_messages m ON m.conversation_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY COALESCE(MAX(m.sent_at), c.updated_at) DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    externalThreadId: row.external_thread_id,
    status: row.status,
    ...(row.current_topic ? { currentTopic: row.current_topic } : {}),
    ...(row.last_message_at ? { lastMessageAt: row.last_message_at.toISOString() } : {}),
    pendingHumanActions: Number(row.pending_human_actions) || 0,
    updatedAt: row.updated_at.toISOString()
  }));
}

export async function getConversation(userId: string, conversationId: string): Promise<ConversationDetailRecord | null> {
  const conversationResult = await getPool().query<{
    id: string;
    external_thread_id: string;
    status: ConversationStatus;
    current_topic: string | null;
    temporary_instruction: string | null;
    temporary_instruction_scope: TemporaryInstructionScope | null;
    temporary_instruction_remaining: number | null;
    pending_human_actions: string | number;
    updated_at: Date;
  }>(
    `SELECT c.id, c.external_thread_id, c.status, c.current_topic,
            c.temporary_instruction, c.temporary_instruction_scope, c.temporary_instruction_remaining,
            c.updated_at,
            (
              SELECT COUNT(*)
              FROM human_actions h
              WHERE h.user_id = c.user_id
                AND h.status = 'pending'
                AND (h.conversation_ref = c.id::text OR h.conversation_ref = c.external_thread_id)
            ) AS pending_human_actions
     FROM conversations c
     WHERE c.user_id = $1 AND c.id = $2
     LIMIT 1`,
    [userId, conversationId]
  );
  const conversation = conversationResult.rows[0];
  if (!conversation) return null;

  const messagesResult = await getPool().query<{
    id: string;
    direction: "incoming" | "outgoing";
    body: string;
    sent_at: Date;
  }>(
    `SELECT id, direction, body, sent_at
     FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY sent_at ASC, created_at ASC`,
    [conversationId]
  );

  const messages = messagesResult.rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    text: row.body,
    sentAt: row.sent_at.toISOString()
  }));

  const temporaryInstruction = conversation.temporary_instruction && conversation.temporary_instruction_scope
    ? {
        text: conversation.temporary_instruction,
        scope: conversation.temporary_instruction_scope,
        ...(conversation.temporary_instruction_remaining
          ? { remainingReplies: conversation.temporary_instruction_remaining }
          : {})
      }
    : undefined;

  return {
    id: conversation.id,
    externalThreadId: conversation.external_thread_id,
    status: conversation.status,
    ...(conversation.current_topic ? { currentTopic: conversation.current_topic } : {}),
    ...(messages.length ? { lastMessageAt: messages[messages.length - 1].sentAt } : {}),
    pendingHumanActions: Number(conversation.pending_human_actions) || 0,
    updatedAt: conversation.updated_at.toISOString(),
    messages,
    ...(temporaryInstruction ? { temporaryInstruction } : {})
  };
}

export async function updateConversationStatus(
  userId: string,
  conversationId: string,
  status: ConversationStatus
): Promise<ConversationSummary | null> {
  const result = await getPool().query<{
    id: string;
    external_thread_id: string;
    status: ConversationStatus;
    current_topic: string | null;
    updated_at: Date;
  }>(
    `UPDATE conversations
     SET status = $1, updated_at = now()
     WHERE id = $2 AND user_id = $3
     RETURNING id, external_thread_id, status, current_topic, updated_at`,
    [status, conversationId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    externalThreadId: row.external_thread_id,
    status: row.status,
    ...(row.current_topic ? { currentTopic: row.current_topic } : {}),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function setConversationTemporaryInstruction(
  userId: string,
  conversationId: string,
  instruction: TemporaryInstruction
): Promise<TemporaryInstruction | null> {
  const remainingReplies = instruction.scope === "next-message"
    ? 1
    : instruction.scope === "next-n-replies"
      ? instruction.remainingReplies
      : null;
  const result = await getPool().query<{ id: string }>(
    `UPDATE conversations
     SET temporary_instruction = $1,
         temporary_instruction_scope = $2,
         temporary_instruction_remaining = $3,
         updated_at = now()
     WHERE id = $4 AND user_id = $5
     RETURNING id`,
    [instruction.text, instruction.scope, remainingReplies ?? null, conversationId, userId]
  );
  if (!result.rows[0]) return null;
  return {
    text: instruction.text,
    scope: instruction.scope,
    ...(remainingReplies ? { remainingReplies } : {})
  };
}

export async function clearConversationTemporaryInstruction(
  userId: string,
  conversationId: string
): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE conversations
     SET temporary_instruction = NULL,
         temporary_instruction_scope = NULL,
         temporary_instruction_remaining = NULL,
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return Boolean(result.rowCount);
}
