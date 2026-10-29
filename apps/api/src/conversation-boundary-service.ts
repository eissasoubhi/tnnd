import { getPool } from "./db-client.js";
import { UNCERTAIN_BOUNDARY, acceptStructuredBoundaryDecision,
  type ConversationBoundaryMessage, type ConversationBoundary,
  type StructuredBoundaryDecision } from "../../../src/conversation-boundary-policy.js";
import { classifyAuthenticatedBoundary } from "./conversation-semantic-classifier.js";

/** Server independently classifies bounded, verified-direction observations.
 * Never accept a caller-supplied "set status to disabled" decision.
 */
export interface ObservedConversationBoundary {
  externalThreadId: string;
  messages: ConversationBoundaryMessage[];
}
export function validateObservedConversationBoundary(value: unknown): ObservedConversationBoundary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_conversation_boundary");
  const item = value as Record<string, unknown>;
  const externalThreadId = typeof item.externalThreadId === "string" ? item.externalThreadId.trim() : "";
  if (!externalThreadId || externalThreadId.length > 512) throw new Error("invalid_conversation_boundary");
  if (!Array.isArray(item.messages) || item.messages.length < 1 || item.messages.length > 12) throw new Error("invalid_conversation_boundary");
  const messages = item.messages.map((candidate): ConversationBoundaryMessage => {
    if (!candidate || typeof candidate !== "object") throw new Error("invalid_conversation_boundary");
    const row = candidate as Record<string, unknown>;
    if ((row.direction !== "incoming" && row.direction !== "outgoing") || typeof row.text !== "string"
      || !row.text.trim() || row.text.length > 4000) throw new Error("invalid_conversation_boundary");
    return { direction: row.direction, text: row.text };
  });
  if (messages.at(-1)?.direction !== "incoming") throw new Error("invalid_conversation_boundary");
  return { externalThreadId, messages };
}

export interface BoundaryTransition {
  status: "waiting-for-them" | "moved-off-tinder" | "disabled";
  managementState: "ai-managed" | "moved-off-tinder" | "unmanaged";
}
/** No automatic status transitions on guesses, a standalone 'ok', or outgoing bubbles. */
export function desiredBoundaryTransition(boundary: ConversationBoundary): BoundaryTransition | null {
  if (boundary.kind === "rest") return { status: "waiting-for-them", managementState: "ai-managed" };
  if (boundary.kind === "off-tinder") return { status: "moved-off-tinder", managementState: "moved-off-tinder" };
  if (boundary.kind === "do-not-contact") return { status: "disabled", managementState: "unmanaged" };
  return null;
}

/**
 * A browser observation is only a *hint* that we should inspect persisted
 * history. It is never sufficient evidence for a server status transition.
 * Compare the newest message (and its immediate predecessor when the
 * observation includes it) against the authenticated conversation's durable
 * message tail. Both direction and content must agree.
 */
export function verifiedConversationBoundary(
  observed: readonly ConversationBoundaryMessage[],
  persisted: readonly ConversationBoundaryMessage[],
  aiDecision: StructuredBoundaryDecision = UNCERTAIN_BOUNDARY
): StructuredBoundaryDecision {
  const actual = persisted.slice(-12);
  const latest = actual.at(-1);
  const offered = observed.at(-1);
  const equal = (a: ConversationBoundaryMessage | undefined, b: ConversationBoundaryMessage | undefined): boolean =>
    Boolean(a && b && a.direction === b.direction && a.text.replace(/\s+/g, " ").trim() === b.text.replace(/\s+/g, " ").trim());
  if (!latest || latest.direction !== "incoming" || !equal(latest, offered)) return UNCERTAIN_BOUNDARY;
  if (observed.length > 1 && !equal(actual.at(-2), observed.at(-2))) return UNCERTAIN_BOUNDARY;
  const assessed = acceptStructuredBoundaryDecision(aiDecision, actual);
  // Single message cannot verify a mutual sign-off / accepted handoff.
  if (observed.length < 2 && (assessed.kind === "rest" ||
      (assessed.kind === "off-tinder" && assessed.evidence === "accepted-handoff") ||
      assessed.kind === "acknowledgement")) return UNCERTAIN_BOUNDARY;
  return assessed;
}

/** Never persist a platform without a stored, verified incoming source. */
export function handoffProvenance(
  boundary: ConversationBoundary,
  source: { direction: "incoming" | "outgoing"; external_message_id: string } | undefined
): { platform: "instagram" | "whatsapp" | "snapchat" | "telegram"; sourceExternalMessageId: string } | null {
  if (boundary.kind !== "off-tinder" || !boundary.platform
    || source?.direction !== "incoming" || !source.external_message_id) return null;
  return { platform: boundary.platform, sourceExternalMessageId: source.external_message_id };
}

export async function recordObservedConversationBoundary(
  userId: string, input: ObservedConversationBoundary,
  classify: typeof classifyAuthenticatedBoundary = classifyAuthenticatedBoundary
): Promise<{ boundary: StructuredBoundaryDecision; applied: boolean; status: string | null }> {
  // Never hold the conversation row lock while calling Gemini. Pre-read
  // persisted evidence, classify once, then re-verify under the lock.
  const db = getPool();
  const head = await db.query<{id:string}>(
    "SELECT id FROM conversations WHERE user_id = $1 AND external_thread_id = $2",
    [userId,input.externalThreadId]
  );
  const conversationId = head.rows[0]?.id;
  if (!conversationId) return {boundary:UNCERTAIN_BOUNDARY,applied:false,status:null};
  const historyQuery =
    "SELECT direction, body, external_message_id FROM (SELECT direction, body, external_message_id, sent_at, id FROM conversation_messages " +
    "WHERE conversation_id = $1 ORDER BY sent_at DESC, id DESC LIMIT 12) recent ORDER BY sent_at ASC, id ASC";
  const initial = await db.query<{direction:"incoming"|"outgoing";body:string;external_message_id:string}>(historyQuery,[conversationId]);
  const messages = initial.rows.map(row => ({direction:row.direction,text:row.body}));
  // Unverified/stale observations never trigger a provider call or a send.
  if (verifiedConversationBoundary(input.messages,messages,{...UNCERTAIN_BOUNDARY,kind:"continue",evidence:"ongoing",confidence:1}).kind !== "continue")
    return {boundary:UNCERTAIN_BOUNDARY,applied:false,status:null};
  const aiDecision = await classify(userId,input.externalThreadId,messages);
  const client = await db.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const conversation = await client.query<{
      id:string;status:string;management_state:string;management_selected_at:Date|null
    }>(
      "SELECT id, status, management_state, management_selected_at FROM conversations WHERE user_id = $1 AND external_thread_id = $2 FOR UPDATE",
      [userId,input.externalThreadId]
    );
    const row = conversation.rows[0];
    if (!row || row.id !== conversationId) {
      await client.query("COMMIT");committed=true;
      return {boundary:UNCERTAIN_BOUNDARY,applied:false,status:row?.status??null};
    }
    const history = await client.query<{direction:"incoming"|"outgoing";body:string;external_message_id:string}>(
      historyQuery,[row.id]
    );
    const current = history.rows.map(entry=>({direction:entry.direction,text:entry.body}));
    // Exact full message tail must remain unchanged during model inference.
    const sameTail = JSON.stringify(current) === JSON.stringify(messages);
    const boundary = sameTail ? verifiedConversationBoundary(input.messages,current,aiDecision) : UNCERTAIN_BOUNDARY;
    const transition = desiredBoundaryTransition(boundary);
    const handoff = handoffProvenance(boundary,history.rows.at(-1));
    const canApply = Boolean(transition && row.management_state === "ai-managed"
      && row.management_selected_at && ["active","waiting-for-them"].includes(row.status));
    if (!canApply || !transition || (transition.status === "moved-off-tinder" && !handoff)) {
      await client.query("COMMIT");committed=true;
      return {boundary,applied:false,status:row.status};
    }
    const update = await client.query<{status:string}>(
      "UPDATE conversations SET status = $3, management_state = $4, " +
      "management_selected_at = CASE WHEN $4 = 'ai-managed' THEN management_selected_at ELSE NULL END, " +
      "handoff_platform = CASE WHEN $3 = 'moved-off-tinder' THEN $5 ELSE handoff_platform END, " +
      "handoff_source_external_message_id = CASE WHEN $3 = 'moved-off-tinder' THEN $6 ELSE handoff_source_external_message_id END, " +
      "updated_at = now() WHERE user_id = $1 AND id = $2 " +
      "AND management_state = 'ai-managed' AND management_selected_at IS NOT NULL " +
      "AND status IN ('active', 'waiting-for-them') " +
      "AND (status <> $3 OR management_state <> $4) RETURNING status",
      [userId,row.id,transition.status,transition.managementState,handoff?.platform??null,
        handoff?.sourceExternalMessageId??null]
    );
    await client.query("COMMIT");committed=true;
    return {boundary,applied:Boolean(update.rowCount),status:update.rows[0]?.status??row.status};
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
