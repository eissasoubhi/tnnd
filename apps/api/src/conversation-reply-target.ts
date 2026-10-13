/** Resolve an optional manual preview message against saved conversation history.
 * Never fabricate a match reply or accidentally use the user's last outgoing
 * message as the target. This only generates a local draft, never sends it.
 */
export function resolveReplyTarget(
  override: string | undefined,
  messages: readonly { direction: "incoming" | "outgoing"; text: string }[]
): string {
  if (override?.trim()) return override.trim();
  const latestIncoming = [...messages].reverse().find(message =>
    message.direction === "incoming" && Boolean(message.text.trim())
  );
  if (!latestIncoming) throw new Error("no_synced_incoming_message");
  return latestIncoming.text.trim();
}
