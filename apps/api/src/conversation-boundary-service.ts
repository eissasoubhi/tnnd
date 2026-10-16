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

export async function recordObservedConversationBoundary(
  userId: string, input: ObservedConversationBoundary
): Promise<{ boundary: ConversationBoundary; applied: boolean; status: string | null }> {
  const boundary = classifyConversationBoundary(input.messages);
  const transition = desiredBoundaryTransition(boundary);
  if (!transition) return { boundary, applied: false, status: null };
  // Fail closed: only an explicitly AI-managed conversation currently eligible
  // for automation may be automatically ended. Manual/archived/paused chats stay untouched.
  // User can still explicitly resume/reconfigure later through the Control Center.
  const statement = [
    "UPDATE conversations",
    "SET status = $3, management_state = $4,",
    "management_selected_at = CASE WHEN $4 = 'ai-managed' THEN management_selected_at ELSE NULL END,",
    "updated_at = now()",
    "WHERE user_id = $1 AND external_thread_id = $2",
    "AND management_state = 'ai-managed' AND management_selected_at IS NOT NULL",
    "AND status IN ('active', 'waiting-for-them')",
    "AND (status <> $3 OR management_state <> $4)",
    "RETURNING status"
  ].join(" ");
  const result = await getPool().query<{ status: string }>(
    statement,
    [userId, input.externalThreadId, transition.status, transition.managementState]
  );
  return { boundary, applied: Boolean(result.rowCount), status: result.rows[0]?.status ?? null };
}
