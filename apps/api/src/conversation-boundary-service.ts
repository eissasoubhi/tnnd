import { getPool } from "./db-client.js";
import { classifyConversationBoundary, type ConversationBoundaryMessage, type ConversationBoundary } from "../../../src/conversation-boundary-policy.js";

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
  persisted: readonly ConversationBoundaryMessage[]
): ConversationBoundary {
  const actual = persisted.slice(-12);
  const latest = actual.at(-1);
  const offered = observed.at(-1);
  const equal = (a: ConversationBoundaryMessage | undefined, b: ConversationBoundaryMessage | undefined): boolean =>
    Boolean(a && b && a.direction === b.direction && a.text.replace(/\s+/g, " ").trim() === b.text.replace(/\s+/g, " ").trim());
  if (!latest || latest.direction !== "incoming" || !equal(latest, offered)) {
    return { kind: "continue", platform: null };
  }
  // If the client observed more than one message, verify at least the
  // immediate context used to infer mutual goodbyes / handoff acceptance.
  if (observed.length > 1 && !equal(actual.at(-2), observed.at(-2))) {
    return { kind: "continue", platform: null };
  }
  const boundary = classifyConversationBoundary(actual);
  // Never infer a mutual sign-off or accepted handoff from an observation that
  // did not include the verified predecessor.
  if (observed.length < 2 && boundary.kind !== "do-not-contact") {
    const single = classifyConversationBoundary([latest]);
    return single.kind !== "continue" ? single : { kind: "continue", platform: null };
  }
  return boundary;
}

export async function recordObservedConversationBoundary(
  userId: string, input: ObservedConversationBoundary
): Promise<{ boundary: ConversationBoundary; applied: boolean; status: string | null }> {
  const noBoundary: ConversationBoundary = { kind: "continue", platform: null };
  const client = await getPool().connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    // The same row lock is used by message sync, so a new message cannot be
    // inserted between verifying the tail and changing this conversation.
    const conversation = await client.query<{
      id: string; status: string; management_state: string; management_selected_at: Date | null
    }>(
      "SELECT id, status, management_state, management_selected_at FROM conversations WHERE user_id = $1 AND external_thread_id = $2 FOR UPDATE",
      [userId, input.externalThreadId]
    );
    const row = conversation.rows[0];
    if (!row) {
      await client.query("COMMIT"); committed = true;
      return { boundary: noBoundary, applied: false, status: null };
    }
    const history = await client.query<{ direction: "incoming" | "outgoing"; body: string }>(
      "SELECT direction, body FROM (SELECT direction, body, sent_at, id FROM conversation_messages "
      + "WHERE conversation_id = $1 ORDER BY sent_at DESC, id DESC LIMIT 12) recent "
      + "ORDER BY sent_at ASC, id ASC",
      [row.id]
    );
    const persisted = history.rows.map(m => ({ direction: m.direction, text: m.body }));
    const boundary = verifiedConversationBoundary(input.messages, persisted);
    const transition = desiredBoundaryTransition(boundary);
    const canApply = Boolean(transition && row.management_state === "ai-managed"
      && row.management_selected_at && ["active", "waiting-for-them"].includes(row.status));
    if (!canApply || !transition) {
      await client.query("COMMIT"); committed = true;
      return { boundary, applied: false, status: row.status };
    }
    const update = await client.query<{ status: string }>(
      "UPDATE conversations SET status = $3, management_state = $4, "
      + "management_selected_at = CASE WHEN $4 = 'ai-managed' THEN management_selected_at ELSE NULL END, "
      + "updated_at = now() WHERE user_id = $1 AND id = $2 "
      + "AND management_state = 'ai-managed' AND management_selected_at IS NOT NULL "
      + "AND status IN ('active', 'waiting-for-them') "
      + "AND (status <> $3 OR management_state <> $4) RETURNING status",
      [userId, row.id, transition.status, transition.managementState]
    );
    await client.query("COMMIT"); committed = true;
    return { boundary, applied: Boolean(update.rowCount), status: update.rows[0]?.status ?? row.status };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
