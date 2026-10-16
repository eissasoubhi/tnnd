import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";
import type { OutgoingContactEvidence } from "./outgoing-contact-evidence.js";

/** Idempotent, user-scoped append of metadata for one verified outgoing
 * Tinder message. Locks the conversation row shared with message sync, so
 * concurrent live sync and historical backfill cannot duplicate this event.
 * No contact identifier/phone is stored in context_json or logged here.
 */
export async function ensureOutgoingContactRecord(
  userId: string, conversationId: string, evidence: OutgoingContactEvidence
): Promise<boolean> {
  const client = await getPool().connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const verified = await client.query(
      "SELECT m.id FROM conversations c "
      + "JOIN conversation_messages m ON m.conversation_id = c.id "
      + "WHERE c.user_id = $1 AND c.id = $2 AND m.external_message_id = $3 "
      + "AND m.direction = 'outgoing' FOR UPDATE OF c",
      [userId, conversationId, evidence.sourceExternalMessageId]
    );
    if (!verified.rowCount) {
      await client.query("COMMIT"); committed = true;
      return false;
    }
    const existing = await client.query(
      "SELECT id FROM human_actions WHERE user_id = $1 AND conversation_ref = $2 "
      + "AND context_json->>'sourceExternalMessageId' = $3 LIMIT 1",
      [userId, conversationId, evidence.sourceExternalMessageId]
    );
    if (existing.rowCount) {
      await client.query("COMMIT"); committed = true;
      return false;
    }
    await client.query(
      "INSERT INTO human_actions (id, user_id, conversation_ref, conversation_label, "
      + "title, detail, severity, status, context_json, resolved_at) "
      + "VALUES ($1, $2, $3, '', $4, $5, 'info', 'completed', $6::jsonb, now())",
      [
        randomUUID(), userId, conversationId, "You shared a contact",
        "Contact platform recorded without copying the contact value.",
        JSON.stringify({
          kind: "user-social-contact-shared",
          platform: evidence.platform,
          sourceExternalMessageId: evidence.sourceExternalMessageId,
          direction: "outgoing"
        })
      ]
    );
    await client.query("COMMIT"); committed = true;
    return true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
