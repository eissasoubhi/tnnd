/** A single old unanswered inbound message is eligible for the same reply flow
 * as a new inbound message. Its age is not proof that it was answered.
 * The last VISIBLE message must be confidently incoming.
 * Never silently discard unknown-direction bubbles.
 */
export type VisibleMessageDirection = "me" | "them" | "unknown";
export type UnansweredStatus =
  | "unanswered" | "already-replied" | "unrecognized-direction"
  | "no-messages" | "no-incoming";
export function unansweredStatus(messages: readonly { direction: VisibleMessageDirection; text: string }[]): UnansweredStatus {
  const readable = messages.filter(x => Boolean(x.text.trim()));
  if (!readable.length) return "no-messages";
  if (readable.at(-1)?.direction === "unknown") return "unrecognized-direction";
  if (readable.at(-1)?.direction === "me") return "already-replied";
  if (readable.at(-1)?.direction === "them") return "unanswered";
  return "no-incoming";
}
/** Fingerprint of the last incoming bubble and the immediate *known* context.
 * Stable if Tinder lazy-loads older history; does not depend on message count.
 * It intentionally treats an identical repeat with identical immediate context
 * conservatively as already handled until stronger Tinder IDs are available.
 */
export function lastUnansweredEvidence(
  messages: readonly { direction: VisibleMessageDirection; text: string }[]
): string | null {
  if (unansweredStatus(messages) !== "unanswered") return null;
  const relevant = messages.filter(x => Boolean(x.text.trim()));
  const last = relevant.at(-1)!;
  const previousOutgoing = [...relevant.slice(0, -1)].reverse().find(x => x.direction === "me");
  return [previousOutgoing?.text.replace(/\s+/g, " ").trim().slice(-180) ?? "", last.text.replace(/\s+/g, " ").trim().slice(0, 400)].join("\u001f");
}
