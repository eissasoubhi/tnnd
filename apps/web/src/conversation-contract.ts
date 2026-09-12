export const CONVERSATION_STATUSES = [
  "active",
  "paused",
  "disabled",
  "waiting-for-them",
  "waiting-for-user",
  "action-required",
  "moved-off-tinder",
  "stale",
  "archived",
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export interface ConversationListItem {
  id: string;
  displayName: string;
  status: ConversationStatus;
  currentTopic?: string | null;
  lastMessageAt?: string | null;
  pendingHumanActions: number;
}

export interface ConversationControlSummary {
  id: string;
  status: ConversationStatus;
  currentTopic?: string | null;
  stage?: string | null;
  persistentInstructions?: string | null;
  temporaryInstruction?: string | null;
  automationEnabled: boolean;
}

export function isConversationStatus(value: unknown): value is ConversationStatus {
  return typeof value === "string" && (CONVERSATION_STATUSES as readonly string[]).includes(value);
}

export function normalizeConversationListItem(value: unknown): ConversationListItem {
  if (!value || typeof value !== "object") throw new Error("Conversation must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !input.id) throw new Error("Conversation id is required");
  if (typeof input.displayName !== "string" || !input.displayName) throw new Error("Conversation displayName is required");
  if (!isConversationStatus(input.status)) throw new Error("Conversation status is invalid");

  return {
    id: input.id,
    displayName: input.displayName,
    status: input.status,
    currentTopic: typeof input.currentTopic === "string" ? input.currentTopic : null,
    lastMessageAt: typeof input.lastMessageAt === "string" ? input.lastMessageAt : null,
    pendingHumanActions:
      typeof input.pendingHumanActions === "number" && input.pendingHumanActions >= 0
        ? Math.floor(input.pendingHumanActions)
        : 0,
  };
}
