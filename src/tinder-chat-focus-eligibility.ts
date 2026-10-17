/** Only measured, in-focus work counts toward a conversation's daily budget. */
export function isObservedFocusedChat(
  state: {
    enabled: boolean; mode: string; activeConversationRef: string | null;
    activeConversationUntil: string | null; phase: string;
  }, ref: string, nowMs: number
): boolean {
  if (!state.enabled || state.mode !== "watcher" || state.activeConversationRef !== ref ||
      !state.activeConversationUntil || Date.parse(state.activeConversationUntil) <= nowMs)
    return false;
  return ["incoming", "generating", "sending", "checking"].includes(state.phase);
}
