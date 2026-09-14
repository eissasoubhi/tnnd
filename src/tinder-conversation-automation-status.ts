export type TinderAutomationConversationStatus =
  | "active"
  | "paused"
  | "disabled"
  | "waiting-for-them"
  | "waiting-for-user"
  | "action-required"
  | "moved-off-tinder"
  | "stale"
  | "archived";

export function conversationStatusAllowsTinderAutomation(status: TinderAutomationConversationStatus | null): boolean {
  return status !== "action-required"
    && status !== "paused"
    && status !== "disabled"
    && status !== "archived"
    && status !== "moved-off-tinder";
}

export function describeConversationAutomationPause(status: TinderAutomationConversationStatus | null): string | null {
  if (status === "action-required") {
    return "Human action required · Tinder automation paused until the action is resolved in TNND.";
  }
  if (!conversationStatusAllowsTinderAutomation(status)) {
    return `Conversation automation paused by server status: ${status}.`;
  }
  return null;
}

export function reconcileAutomationPauseMessage(
  currentMessage: string | null,
  status: TinderAutomationConversationStatus | null
): string | null {
  const nextPause = describeConversationAutomationPause(status);
  if (nextPause) return nextPause;
  if (
    currentMessage?.startsWith("Human action required ·")
    || currentMessage?.startsWith("Conversation automation paused by server status:")
  ) {
    return null;
  }
  return currentMessage;
}
