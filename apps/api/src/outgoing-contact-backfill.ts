import { getPool } from "./db-client.js";
import { outgoingContactEvidence, type ContactHistoryBubble } from "./outgoing-contact-evidence.js";
import { ensureOutgoingContactRecord } from "./outgoing-contact-record-service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const PAGE_SIZE = 200;

export interface OutgoingContactBackfillOptions {
  userId: string;
  afterConversation?: string;
  maxConversations?: number;
  apply?: boolean;
}
export interface OutgoingContactBackfillReport {
  mode: "dry-run" | "apply";
  conversationsScanned: number;
  messagesScanned: number;
  newCandidates: number;
  alreadyRecorded: number;
  inserted: number;
  afterConversation: string | null;
  /** Resume with --after-conversation=<cursor>, never with an external thread name. */
  nextCursor: string | null;
  mayHaveMore: boolean;
}
export function validateContactBackfillOptions(options: OutgoingContactBackfillOptions): Required<OutgoingContactBackfillOptions> {
  const userId = options.userId?.trim() ?? "";
  const afterConversation = options.afterConversation?.trim() || ZERO_UUID;
  const maxConversations = options.maxConversations ?? 25;
  if (!UUID.test(userId) || !UUID.test(afterConversation)
    || !Number.isInteger(maxConversations) || maxConversations < 1 || maxConversations > 200
    || (options.apply !== undefined && typeof options.apply !== "boolean")) {
    throw new Error("invalid_contact_backfill_options");
  }
  return { userId, afterConversation, maxConversations, apply: options.apply === true };
}

/** Default is a read-only dry run. Apply always needs an explicit CLI flag.
 * Batch by conversation ID with a stable keyset cursor; stream individual chat
 * messages in bounded pages, carrying only the immediate previous bubble.
 */
export async function runOutgoingContactBackfill(
  rawOptions: OutgoingContactBackfillOptions
): Promise<OutgoingContactBackfillReport> {
  const options = validateContactBackfillOptions(rawOptions);
  const pool = getPool();
  const conversations = await pool.query<{ id: string }>(
    "SELECT id::text AS id FROM conversations WHERE user_id = $1 AND id > $2::uuid "
    + "ORDER BY id LIMIT $3",
    [options.userId, options.afterConversation, options.maxConversations + 1]
  );
  const selected = conversations.rows.slice(0, options.maxConversations);
  const report: OutgoingContactBackfillReport = {
    mode: options.apply ? "apply" : "dry-run", conversationsScanned: 0,
    messagesScanned: 0, newCandidates: 0, alreadyRecorded: 0, inserted: 0,
    afterConversation: options.afterConversation === ZERO_UUID ? null : options.afterConversation,
    nextCursor: null, mayHaveMore: conversations.rows.length > options.maxConversations
  };
  for (const conversation of selected) {
    const already = await pool.query<{ source_id: string | null }>(
      "SELECT context_json->>'sourceExternalMessageId' AS source_id FROM human_actions "
      + "WHERE user_id = $1 AND conversation_ref = $2 "
      + "AND context_json->>'kind' = 'user-social-contact-shared'",
      [options.userId, conversation.id]
    );
    const recorded = new Set(already.rows.map(row => row.source_id).filter((id): id is string => Boolean(id)));
    let previous: ContactHistoryBubble | undefined;
    let cursorTime: Date | null = null;
    let cursorId: string | null = null;
    for (;;) {
      const messages = await pool.query<{
        id: string; external_message_id: string; direction: "incoming" | "outgoing";
        body: string; sent_at: Date
      }>(
        "SELECT id::text AS id, external_message_id, direction, body, sent_at "
        + "FROM conversation_messages WHERE conversation_id = $1 "
        + "AND ($2::timestamptz IS NULL OR (sent_at, id) > ($2::timestamptz, $3::uuid)) "
        + "ORDER BY sent_at ASC, id ASC LIMIT $4",
        [conversation.id, cursorTime?.toISOString() ?? null, cursorId, PAGE_SIZE]
      );
      if (!messages.rows.length) break;
      for (const row of messages.rows) {
        const message: ContactHistoryBubble = {
          externalMessageId: row.external_message_id,
          direction: row.direction, text: row.body
        };
        report.messagesScanned += 1;
        const evidence = outgoingContactEvidence(message, previous);
        previous = message;
        if (!evidence) continue;
        if (recorded.has(evidence.sourceExternalMessageId)) {
          report.alreadyRecorded += 1;
          continue;
        }
        report.newCandidates += 1;
        if (options.apply) {
          if (await ensureOutgoingContactRecord(options.userId, conversation.id, evidence)) {
            report.inserted += 1;
          }
        }
        recorded.add(evidence.sourceExternalMessageId);
      }
      const last = messages.rows.at(-1)!;
      cursorTime = last.sent_at;
      cursorId = last.id;
      if (messages.rows.length < PAGE_SIZE) break;
    }
    report.conversationsScanned++;
    report.nextCursor = conversation.id;
  }
  return report;
}
