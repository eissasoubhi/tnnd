export type TinderConversationManagementState =
  | "unmanaged"
  | "ai-managed"
  | "manual"
  | "moved-off-tinder"
  | "archived";

export interface TinderConversationManagement {
  state: TinderConversationManagementState;
  explicitlySelected: boolean;
}

export const DEFAULT_TINDER_CONVERSATION_MANAGEMENT: TinderConversationManagement = {
  state: "unmanaged",
  explicitlySelected: false
};

export function normalizeTinderConversationManagement(
  value: Partial<TinderConversationManagement> | null | undefined
): TinderConversationManagement {
  if (!value) return { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT };
  const allowed = new Set<TinderConversationManagementState>([
    "unmanaged",
    "ai-managed",
    "manual",
    "moved-off-tinder",
    "archived"
  ]);
  const state = allowed.has(value.state as TinderConversationManagementState)
    ? value.state as TinderConversationManagementState
    : "unmanaged";
  return {
    state,
    explicitlySelected: value.explicitlySelected === true
  };
}

export function mayAiTakeOverTinderConversation(
  value: Partial<TinderConversationManagement> | null | undefined
): boolean {
  const management = normalizeTinderConversationManagement(value);
  return management.state === "ai-managed" && management.explicitlySelected;
}

export function mayObserveTinderConversationReadOnly(
  value: Partial<TinderConversationManagement> | null | undefined
): boolean {
  const management = normalizeTinderConversationManagement(value);
  return management.state !== "archived";
}

export function mustKeepTinderAutomationDisabled(
  value: Partial<TinderConversationManagement> | null | undefined
): boolean {
  return !mayAiTakeOverTinderConversation(value);
}

export function describeTinderManagementPause(
  value: Partial<TinderConversationManagement> | null | undefined
): string | null {
  const management = normalizeTinderConversationManagement(value);
  if (management.state === "ai-managed" && management.explicitlySelected) return null;
  if (management.state === "manual") return "Manual takeover · TNND automation stays disabled until AI management is explicitly restored.";
  if (management.state === "moved-off-tinder") return "Moved off Tinder · TNND will not automate this Tinder thread.";
  if (management.state === "archived") return "Archived conversation · TNND automation is disabled.";
  if (management.state === "ai-managed") return "AI management not confirmed · explicitly select this conversation before automation can run.";
  return "Unmanaged conversation · TNND automation is disabled until AI management is explicitly selected.";
}
