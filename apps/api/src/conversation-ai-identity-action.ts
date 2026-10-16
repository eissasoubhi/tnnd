import { getPool } from "./db-client.js";
import { createHumanAction } from "./human-action-service.js";
import { latestIncomingAsksAboutAiIdentity } from "../../../src/conversation-ai-identity-question.js";

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
  const result = await getPool().query<{
    direction: "incoming" | "outgoing";
    body: string;
    external_message_id: string;
  }>(
    `SELECT direction, body, external_message_id FROM conversation_messages
     WHERE conversation_id = $1 ORDER BY sent_at DESC, created_at DESC LIMIT 6`,
    [conversationId]
  );
  const last = result.rows[0];
  if (!last || last.direction !== "incoming" || !acceptedIds.includes(last.external_message_id)) return false;
  const latestFirst = result.rows.map(row => ({ direction: row.direction, text: row.body })).reverse();
  if (!latestIncomingAsksAboutAiIdentity(latestFirst)) return false;
  const original = result.rows.find(row => row.direction === "incoming"
    && row.body && latestIncomingAsksAboutAiIdentity([{ direction: "incoming", text: row.body }]));
  await ensureAiIdentityAction(userId, conversationId, original?.external_message_id ?? last.external_message_id);
  return true;
}
