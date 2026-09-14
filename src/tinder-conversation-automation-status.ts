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

export type TinderAutomationDisposition = {
  allowed: boolean;
  status: TinderAutomationConversationStatus | null;
  reason: "human-action" | "waiting-for-user" | "server-paused" | "server-disabled" | "archived" | "moved-off-tinder" | null;
  message: string | null;
};

export function getConversationAutomationDisposition(
  status: TinderAutomationConversationStatus | null
): TinderAutomationDisposition {
  if (status === "action-required") {
    return {
      allowed: false,
      status,
      reason: "human-action",
      message: "Human action required · Tinder automation paused until the action is resolved in TNND."
    };
  }

  if (status === "waiting-for-user") {
    return {
      allowed: false,
      status,
      reason: "waiting-for-user",
      message: "Waiting for you · Tinder automation stays paused until TNND receives your input or the conversation status changes."
    };
  }

  const reason = status === "paused"
    ? "server-paused"
    : status === "disabled"
      ? "server-disabled"
      : status === "archived"
        ? "archived"
        : status === "moved-off-tinder"
          ? "moved-off-tinder"
          : null;

  if (reason) {
    return {
      allowed: false,
      status,
      reason,
      message: `Conversation automation paused by server status: ${status}.`
    };
  }

  return { allowed: true, status, reason: null, message: null };
}

export function conversationStatusAllowsTinderAutomation(status: TinderAutomationConversationStatus | null): boolean {
  return getConversationAutomationDisposition(status).allowed;
}

export function describeConversationAutomationPause(status: TinderAutomationConversationStatus | null): string | null {
  return getConversationAutomationDisposition(status).message;
}

export function reconcileAutomationPauseMessage(
  currentMessage: string | null,
  status: TinderAutomationConversationStatus | null
): string | null {
  const nextPause = describeConversationAutomationPause(status);
  if (nextPause) return nextPause;
  if (
    currentMessage?.startsWith("Human action required ·")
    || currentMessage?.startsWith("Waiting for you ·")
    || currentMessage?.startsWith("Conversation automation paused by server status:")
  ) {
    return null;
  }
  return currentMessage;
}
