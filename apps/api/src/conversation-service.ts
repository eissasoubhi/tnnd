import { randomUUID } from "node:crypto";
import { recordSharedSocialContacts } from "./social-contact-service.js";
import { inferConversationSemanticTags, type SemanticMessage, type ConversationStageTag, type ConversationToneTag } from "./conversation-semantic-tags.js";
import { statusAfterPassiveSync } from "./conversation-sync-status-policy.js";
import { recordAiIdentityQuestionOnSync } from "./conversation-ai-identity-action.js";
import { listConversationFacts } from "./conversation-fact-service.js";
import { deriveConversationFlow, type ConversationFlowState } from "./conversation-flow.js";
import { analyzeAndRecordConversationFacts } from "./conversation-fact-orchestration-service.js";
import { getPool } from "./db-client.js";
import { tryAcquireConversationThreadLock } from "./conversation-thread-lock-service.js";
import { analyzeAndRecordConversationTopics } from "./conversation-topic-orchestration-service.js";
import { getConversationTopicState, type ConversationTopicState } from "./conversation-topic-service.js";
import { summarizeConversationIfNeeded } from "./conversation-summary-orchestration-service.js";
import type { ConversationSyncRequest, ConversationSyncResponse, ConversationStatus } from "./conversation-sync-contract.js";

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export class ConversationThreadBusyError extends Error {
  readonly code = "conversation_thread_busy";

  constructor() {
    super("conversation_thread_busy");
    this.name = "ConversationThreadBusyError";
  }
}

export interface TemporaryInstruction {
  text: string;
  scope: TemporaryInstructionScope;
  remainingReplies?: number;
}

export interface ConversationSummary {
  id: string;
  externalThreadId: string;
  status: ConversationStatus;
  matchFirstName?: string;
  matchAge?: number;
  matchPhotoUrl?: string;
  userDisplayLabel?: string;
  userDisplayAge?: number;
  currentTopic?: string;
  lastMessageAt?: string;
  lastMessageDirection?: "incoming" | "outgoing";
  pendingHumanActions?: number;
  messageCount?: number;
  matchCity?: string;
  matchDatingGoal?: string;
  matchSharedInstagram?: boolean;
  matchSharedWhatsapp?: boolean;
  userSharedInstagram?: boolean;
  userSharedWhatsapp?: boolean;
  semanticStage?: ConversationStageTag;
  semanticTone?: ConversationToneTag;
  semanticSource?: "rule-based" | "unknown";
  handoffPlatform?: "instagram" | "whatsapp" | "snapchat" | "telegram" | null;
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
  topicState: ConversationTopicState;
  conversationFlow: ConversationFlowState;
}

export async function syncConversation(userId: string, input: ConversationSyncRequest): Promise<ConversationSyncResponse> {
  const client = await getPool().connect();
  let committed = false;
  let result: ConversationSyncResponse | undefined;
  try {
    await client.query("BEGIN");
    const lockAcquired = await tryAcquireConversationThreadLock(client, userId, input.externalThreadId);
    if (!lockAcquired) {
      throw new ConversationThreadBusyError();
    }

    const existing = await client.query<{ id: string; status: ConversationStatus }>(
      `SELECT id, status FROM conversations
       WHERE user_id = $1 AND external_thread_id = $2
       LIMIT 1 FOR UPDATE`,
      [userId, input.externalThreadId]
    );
    let conversationId = existing.rows[0]?.id;
    const status: ConversationStatus = statusAfterPassiveSync(input.status, existing.rows[0]?.status);
    if (!conversationId) {
      conversationId = randomUUID();
      await client.query(
        `INSERT INTO conversations (id, user_id, external_thread_id, status)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, userId, input.externalThreadId, status]
      );
    } else if (input.status && status !== existing.rows[0]?.status) {
      await client.query(
        "UPDATE conversations SET status = $1, updated_at = now() WHERE id = $2 AND user_id = $3",
        [status, conversationId, userId]
      );
    }

    const acceptedMessageIds: string[] = [];
    let acceptedOutgoingCount = 0;
    for (const message of input.messages) {
      const insertResult = await client.query(
        `INSERT INTO conversation_messages (id, conversation_id, external_message_id, direction, body, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (conversation_id, external_message_id) DO NOTHING
         RETURNING external_message_id`,
        [randomUUID(), conversationId, message.externalMessageId, message.direction, message.text, message.sentAt]
      );
      if (insertResult.rowCount) {
        acceptedMessageIds.push(message.externalMessageId);
        if (message.direction === "outgoing") acceptedOutgoingCount += 1;
      }
    }

    // Historical imports must not consume temporary instruction quotas.
    if (!input.readOnlyImport && acceptedOutgoingCount > 0) {
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

    const serverTime = new Date().toISOString();
    const nextCursor = input.nextCursor ?? input.cursor ?? serverTime;
    await client.query(
      `UPDATE conversations
       SET sync_cursor = $1,
           sync_cursor_updated_at = now(),
           updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      [nextCursor, conversationId, userId]
    );
    await client.query("COMMIT");
    committed = true;
    result = { conversationId, status, acceptedMessageIds, nextCursor, serverTime };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!result) throw new Error("conversation_sync_failed");
  if (result.acceptedMessageIds.length > 0) {
    // A direct question about AI must become an explicit human-review pause,
    // not a routine model-generated Tinder answer.
    try {
      await recordAiIdentityQuestionOnSync(userId, result.conversationId, result.acceptedMessageIds);
    } catch {
      console.warn("TNND could not create the AI-identity human action.");
    }
    void analyzeAndRecordConversationTopics(userId, result.conversationId).catch(() => undefined);
    void summarizeConversationIfNeeded(userId, result.conversationId).catch(() => undefined);
    void analyzeAndRecordConversationFacts(userId, result.conversationId).catch(() => undefined);
    void recordSharedSocialContacts(userId, result.conversationId, input.messages, result.acceptedMessageIds)
      .catch((error) => console.warn("TNND contact alert creation failed", error));
  }
  return result;
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const result = await getPool().query<{
    id: string;
    external_thread_id: string;
    status: ConversationStatus;
    current_topic: string | null;
    match_first_name: string | null;
    match_age: string | null;
    match_photo_url: string | null;
    display_label: string | null;
    display_age: number | null;
    last_message_at: Date | null;
    last_message_direction: "incoming" | "outgoing" | null;
    message_count: number;
    match_city: string | null;
    match_dating_goal: string | null;
    match_shared_instagram: boolean;
    match_shared_whatsapp: boolean;
    user_shared_instagram: boolean;
    user_shared_whatsapp: boolean;
    semantic_messages: SemanticMessage[] | null;
    handoff_platform: ConversationSummary["handoffPlatform"];
    pending_human_actions: string | number;
    updated_at: Date;
  }>(
    `SELECT c.id, c.external_thread_id, c.status, c.current_topic, c.updated_at,
             c.handoff_platform, c.display_label, c.display_age,
            (SELECT mp.normalized_profile->'fields'->>'firstName' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_first_name,
            (SELECT mp.normalized_profile->'fields'->>'age' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_age,
            (SELECT mp.normalized_profile->'fields'->>'photoUrl' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_photo_url,
            MAX(m.sent_at) AS last_message_at, COUNT(m.id)::int AS message_count,
             (SELECT COALESCE(jsonb_agg(jsonb_build_object('direction', sm.direction, 'text', left(sm.body, 4000)) ORDER BY sm.sent_at, sm.id), '[]'::jsonb)
                FROM (SELECT direction, body, sent_at, id FROM conversation_messages
                      WHERE conversation_id = c.id ORDER BY sent_at DESC, id DESC LIMIT 30) sm
             ) AS semantic_messages,
             (SELECT mp.normalized_profile->'fields'->>'location' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_city,
             (SELECT mp.normalized_profile->'fields'->>'relationshipGoal' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_dating_goal,
             EXISTS (SELECT 1 FROM human_actions ha WHERE ha.user_id = c.user_id AND ha.conversation_ref = c.id::text AND ha.context_json->>'kind' = 'social-contact-shared' AND ha.context_json->>'platform' = 'instagram') AS match_shared_instagram,
             EXISTS (SELECT 1 FROM human_actions ha WHERE ha.user_id = c.user_id AND ha.conversation_ref = c.id::text AND ha.context_json->>'kind' = 'social-contact-shared' AND ha.context_json->>'platform' = 'whatsapp') AS match_shared_whatsapp,
             EXISTS (SELECT 1 FROM human_actions ha WHERE ha.user_id = c.user_id AND ha.conversation_ref = c.id::text AND ha.context_json->>'kind' = 'user-social-contact-shared' AND ha.context_json->>'platform' = 'instagram') AS user_shared_instagram,
             EXISTS (SELECT 1 FROM human_actions ha WHERE ha.user_id = c.user_id AND ha.conversation_ref = c.id::text AND ha.context_json->>'kind' = 'user-social-contact-shared' AND ha.context_json->>'platform' = 'whatsapp') AS user_shared_whatsapp,
            (SELECT lm.direction FROM conversation_messages lm WHERE lm.conversation_id = c.id
              ORDER BY lm.sent_at DESC, lm.id DESC LIMIT 1) AS last_message_direction,
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
  return result.rows.map((row) => {
    const tags = inferConversationSemanticTags(Array.isArray(row.semantic_messages) ? row.semantic_messages : [], row.status);
    return ({
    id: row.id,
    externalThreadId: row.external_thread_id,
    status: row.status,
    ...(row.display_label || row.match_first_name ? { matchFirstName: (row.display_label || row.match_first_name)! } : {}),
    ...(row.display_label !== null ? { userDisplayLabel: row.display_label } : {}),
    ...(row.display_age || row.match_age ? { matchAge: Number(row.display_age || row.match_age) } : {}),
    ...(row.match_photo_url ? { matchPhotoUrl: row.match_photo_url } : {}),
    ...(row.display_age !== null ? { userDisplayAge: row.display_age } : {}),
    ...(row.current_topic ? { currentTopic: row.current_topic } : {}),
    ...(row.last_message_at ? { lastMessageAt: row.last_message_at.toISOString() } : {}),
    ...(row.last_message_direction ? { lastMessageDirection: row.last_message_direction } : {}),
    pendingHumanActions: Number(row.pending_human_actions) || 0,
    messageCount: Number(row.message_count) || 0,
    ...(row.match_city ? { matchCity: row.match_city } : {}),
    ...(row.match_dating_goal ? { matchDatingGoal: row.match_dating_goal } : {}),
    matchSharedInstagram: row.match_shared_instagram,
    matchSharedWhatsapp: row.match_shared_whatsapp,
    userSharedInstagram: row.user_shared_instagram,
    userSharedWhatsapp: row.user_shared_whatsapp,
    ...(tags.stage ? { semanticStage: tags.stage } : {}),
    ...(tags.tone ? { semanticTone: tags.tone } : {}),
    semanticSource: tags.source,
    handoffPlatform: row.handoff_platform ?? null,
    updatedAt: row.updated_at.toISOString()
  });
  });
}

/** Authenticated search results return only conversation IDs, never private message text. */
export async function searchConversationMessageContent(userId: string, query: string): Promise<string[]> {
  const needle = query.trim();
  if (needle.length < 2 || needle.length > 100) throw new Error("invalid_conversation_search");
  const result = await getPool().query<{ id: string }>(
    `SELECT DISTINCT c.id::text AS id
       FROM conversations c
       JOIN conversation_messages m ON m.conversation_id = c.id
      WHERE c.user_id = $1 AND position(lower($2) in lower(m.body)) > 0
      LIMIT 2000`,
    [userId, needle]
  );
  return result.rows.map(row => row.id);
}

export async function getConversation(userId: string, conversationId: string): Promise<ConversationDetailRecord | null> {
  const conversationResult = await getPool().query<{
    id: string;
    external_thread_id: string;
    status: ConversationStatus;
    current_topic: string | null;
    match_first_name: string | null;
    match_age: string | null;
    match_photo_url: string | null;
    display_label: string | null;
    display_age: number | null;
    temporary_instruction: string | null;
    temporary_instruction_scope: TemporaryInstructionScope | null;
    temporary_instruction_remaining: number | null;
    pending_human_actions: string | number;
    handoff_platform: ConversationSummary["handoffPlatform"];
    updated_at: Date;
  }>(
    `SELECT c.id, c.external_thread_id, c.status, c.current_topic,
             c.handoff_platform, c.display_label, c.display_age,
            (SELECT mp.normalized_profile->'fields'->>'firstName' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_first_name,
            (SELECT mp.normalized_profile->'fields'->>'age' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_age,
            (SELECT mp.normalized_profile->'fields'->>'photoUrl' FROM match_profiles mp WHERE mp.user_id = c.user_id AND mp.conversation_id = c.id LIMIT 1) AS match_photo_url,
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

  const [messagesResult, topicState, flowFacts] = await Promise.all([
    getPool().query<{
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
    ),
    getConversationTopicState(conversationId),
    listConversationFacts(conversationId, 25)
  ]);

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
    handoffPlatform: conversation.handoff_platform ?? null,
    ...(conversation.display_label || conversation.match_first_name ? { matchFirstName: (conversation.display_label || conversation.match_first_name)! } : {}),
    ...(conversation.display_label !== null ? { userDisplayLabel: conversation.display_label } : {}),
    ...(conversation.display_age || conversation.match_age ? { matchAge: Number(conversation.display_age || conversation.match_age) } : {}),
    ...(conversation.match_photo_url ? { matchPhotoUrl: conversation.match_photo_url } : {}),
    ...(conversation.display_age !== null ? { userDisplayAge: conversation.display_age } : {}),
    ...(conversation.current_topic ? { currentTopic: conversation.current_topic } : {}),
    ...(messages.length ? { lastMessageAt: messages[messages.length - 1].sentAt } : {}),
    pendingHumanActions: Number(conversation.pending_human_actions) || 0,
    updatedAt: conversation.updated_at.toISOString(),
    messages,
    topicState,
    conversationFlow: deriveConversationFlow(messages, flowFacts),
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
      ? instruction.remainingReplies ?? null
      : null;
  const result = await getPool().query(
    `UPDATE conversations
     SET temporary_instruction = $1,
         temporary_instruction_scope = $2,
         temporary_instruction_remaining = $3,
         updated_at = now()
     WHERE id = $4 AND user_id = $5
     RETURNING id`,
    [instruction.text, instruction.scope, remainingReplies, conversationId, userId]
  );
  if (!result.rowCount) return null;
  return {
    text: instruction.text,
    scope: instruction.scope,
    ...(remainingReplies ? { remainingReplies } : {})
  };
}

export async function clearConversationTemporaryInstruction(userId: string, conversationId: string): Promise<boolean> {
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

/** User-confirmed identity, not a Tinder scraping claim. Clearing both fields
 * falls back to the separately captured MatchProfile, if one exists. */
export async function updateConversationDisplayIdentity(
  userId: string,
  conversationId: string,
  label: string | null,
  age: number | null
): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE conversations
     SET display_label = $1, display_age = $2, updated_at = now()
     WHERE id = $3 AND user_id = $4
     RETURNING id`,
    [label, age, conversationId, userId]
  );
  return Boolean(result.rowCount);
}
