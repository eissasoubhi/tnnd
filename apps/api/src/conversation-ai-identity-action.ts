import { getPool } from "./db-client.js";
import { createHumanAction } from "./human-action-service.js";
import { isDirectAiIdentityQuestion } from "../../../src/conversation-ai-identity-question.js";

export const AI_IDENTITY_ACTION_KIND = "ai-identity-question";

/** No personal message text or AI-generated excuse is stored in the action. */
export async function ensureAiIdentityAction(userId: string, conversationId: string, sourceMessageId?: string): Promise<void> {
  const found = await getPool().query(
    `SELECT id FROM human_actions
     WHERE user_id = $1 AND conversation_ref = $2
       AND status = 'pending' AND context_json->>'kind' = $3 LIMIT 1`,
    [userId, conversationId, AI_IDENTITY_ACTION_KIND]
  );
  if (found.rowCount) return;
  await createHumanAction(userId, {
    conversationRef: conversationId,
    title: "Match asks whether AI is involved",
    detail: "The match directly asked if AI is writing the replies. Automatic responses are paused. Review the conversation and reply personally and truthfully before resolving this action.",
    severity: "decision-required",
    context: {
      kind: AI_IDENTITY_ACTION_KIND,
      ...(sourceMessageId ? { sourceExternalMessageId: sourceMessageId } : {})
    }
  });
}

/** Act only on an accepted, current inbound message, never historical backfill. */
export async function recordAiIdentityQuestionOnSync(
  userId: string, conversationId: string, acceptedIds: readonly string[]
): Promise<boolean> {
  if (!acceptedIds.length) return false;
  const latest = await getPool().query<{
    direction: "incoming" | "outgoing";
    body: string;
    external_message_id: string;
  }>(
    `SELECT direction, body, external_message_id FROM conversation_messages
     WHERE conversation_id = $1 ORDER BY sent_at DESC, created_at DESC LIMIT 1`,
    [conversationId]
  );
  const message = latest.rows[0];
  if (!message || message.direction !== "incoming"
    || !acceptedIds.includes(message.external_message_id)
    || !isDirectAiIdentityQuestion(message.body)) return false;
  await ensureAiIdentityAction(userId, conversationId, message.external_message_id);
  return true;
}
