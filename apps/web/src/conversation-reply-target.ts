export interface RecentMessage { direction: "incoming" | "outgoing"; text: string }
/** Do not draft a reply to an already answered message. Only prefill when
 * the most recent synchronized message is from the match. */
export function replyTargetFromHistory(messages: readonly RecentMessage[]): string | null {
  const last = messages.at(-1);
  return last?.direction === "incoming" && last.text.trim() ? last.text.trim() : null;
}
export function replyTargetHint(messages: readonly RecentMessage[]): string {
  if (!messages.length) return "No messages have been imported. Open the Tinder chat and use Import visible chat (read-only) in TNND's extension.";
  if (messages.at(-1)?.direction === "outgoing") return "Your own message was last. TNND will not reply to an older incoming message automatically. Wait for a new reply or enter a message manually for a preview.";
  return "The latest received message was loaded from the synced conversation. You can edit it for a one-off preview; nothing is sent to Tinder.";
}
