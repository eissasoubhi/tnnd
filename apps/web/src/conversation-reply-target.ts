export interface RecentMessage { direction: "incoming" | "outgoing"; text: string }

/** Find the latest actual received message, even if an outgoing message followed.
 * This target is ONLY for manual preview; it never authorizes an automated send.
 */
export function replyTargetFromHistory(messages: readonly RecentMessage[]): string | null {
  const incoming = [...messages].reverse().find(message => message.direction === "incoming" && message.text.trim());
  return incoming?.text.trim() ?? null;
}
export function replyTargetHint(messages: readonly RecentMessage[]): string {
  if (!messages.length) return "No messages imported yet. On Tinder, open the conversation and click Import visible chat (read-only) in the TNND extension; then refresh this view.";
  const incoming = replyTargetFromHistory(messages);
  if (!incoming) return "No received message is available in this import. Refresh the visible Tinder chat via the extension. You can still paste a message for a test.";
  if (messages.at(-1)?.direction === "outgoing") {
    return "Loaded the last message from your match. You have already sent a later reply, so this is a manual preview only — do not send it again. Re-import after a new Tinder message.";
  }
  return "Loaded the latest received message from the synced history. Edit it only for an optional one-off preview; nothing is sent to Tinder.";
}
