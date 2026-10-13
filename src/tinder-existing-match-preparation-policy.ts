/** Safe, read-only decision for an EXISTING Tinder match's first AI message.
 * Presence in Matches does not by itself grant permission to send. Manual
 * control, explicit per-chat exclusions and blocked statuses always win.
 */
export interface ExistingMatchPreparationInput {
  managementState?: unknown;
  explicitlySelected?: unknown;
  status?: unknown;
}

export type ExistingMatchPreparationDecision =
  | { kind: "reuse-ai-management" }
  | { kind: "authorize-unmanaged" }
  | { kind: "blocked"; reason: string };

export function classifyExistingMatchPreparation(input: ExistingMatchPreparationInput): ExistingMatchPreparationDecision {
  // Existing chats must be active. Never silently resume paused, archived or
  // human-action-required threads as part of a global match opener.
  if (input.status !== "active") {
    return { kind: "blocked", reason: `Conversation status ${String(input.status ?? "unknown")} does not allow a first AI message` };
  }
  if (input.managementState === "ai-managed" && input.explicitlySelected === true) {
    return { kind: "reuse-ai-management" };
  }
  if ((input.managementState === "unmanaged" || input.managementState == null)
    && input.explicitlySelected !== true) {
    // Only a previously UNSELECTED unmanaged empty chat can be explicitly
    // enrolled in AI management by the confirmed global Start action.
    return { kind: "authorize-unmanaged" };
  }
  return {
    kind: "blocked",
    reason: "Chat is individually controlled, excluded, or AI management was not explicitly confirmed"
  };
}
