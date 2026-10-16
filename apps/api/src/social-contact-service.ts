import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";
import { createHumanAction } from "./human-action-service.js";
import { detectSocialContact } from "./social-contact-detector.js";
import type { ConversationMessageDelta } from "./conversation-sync-contract.js";

export async function recordSharedSocialContacts(
  userId: string, conversationId: string,
  received: readonly ConversationMessageDelta[],
  acceptedIds: readonly string[]
): Promise<void> {
  if (!received.some(m => acceptedIds.includes(m.externalMessageId))) return;
  // The context may span Tinder bubbles or separate sync batches.
  const messages = await getPool().query<{
    external_message_id: string; direction: "incoming"|"outgoing"; body: string
  }>("SELECT external_message_id, direction, body FROM ("
     +" SELECT external_message_id, direction, body, sent_at, id"
     +" FROM conversation_messages WHERE conversation_id = $1"
     +" ORDER BY sent_at DESC, id DESC LIMIT 70"
     +") recent ORDER BY sent_at ASC, id ASC",[conversationId]);
  const accepted = new Set(acceptedIds);
  for (let i=0;i<messages.rows.length;i++) {
    const current = messages.rows[i]!;
    if (!accepted.has(current.external_message_id)) continue;
    const previous = messages.rows.slice(Math.max(0,i-5),i)
      .map(m=>({direction:m.direction,text:m.body.slice(0,500)}));
    const detected = detectSocialContact(current.body, previous);
    if (!detected) continue;
    const existing = await getPool().query(
      "SELECT id FROM human_actions WHERE user_id=$1 AND conversation_ref=$2"
      +" AND context_json->>'sourceExternalMessageId'=$3 LIMIT 1",
      [userId,conversationId,current.external_message_id]
    );
    if (existing.rowCount) continue;
    if (current.direction === "outgoing") {
      // A completed, metadata-only record supports the user's "I shared my
      // contact" filter. Never create an Action Center reminder for their own
      // sent handle, and never duplicate private contact data in context JSON.
      await getPool().query(
        "INSERT INTO human_actions (id, user_id, conversation_ref, conversation_label, title, detail, severity, status, context_json, resolved_at)"
        + " VALUES ($1,$2,$3,'',$4,$5,'info','completed',$6::jsonb,now())",
        [
          randomUUID(), userId, conversationId, "You shared a contact",
          "Contact platform recorded without storing the contact value again.",
          JSON.stringify({
            kind: "user-social-contact-shared",
            platform: detected.platform,
            sourceExternalMessageId: current.external_message_id,
            direction: "outgoing"
          })
        ]
      );
      continue;
    }
    await createHumanAction(userId,{
      conversationRef:conversationId,
      title: detected.platform === "instagram" ? "Instagram shared by match" : "Contact shared by match",
      detail: detected.platform + ": " + detected.value,
      severity:"info",
      context:{
        kind:"social-contact-shared",
        platform:detected.platform,
        contact:detected.value,
        sourceExternalMessageId: current.external_message_id,
        deliveryState:"not-contacted"
      }
    });
  }
}
