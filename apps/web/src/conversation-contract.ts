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

export type ConversationStageTag = "introductions" | "getting-to-know" | "date-discussion" | "off-tinder";
export type ConversationToneTag = "playful" | "flirty" | "warm" | "direct";
export const semanticStages = ["introductions", "getting-to-know", "date-discussion", "off-tinder"] as const;
export const semanticTones = ["playful", "flirty", "warm", "direct"] as const;

export interface ConversationListItem {
  id: string;
  displayName: string;
  matchAge?: number | null;
  matchPhotoUrl?: string | null;
  status: ConversationStatus;
  currentTopic?: string | null;
  lastMessageAt?: string | null;
  lastMessageDirection?: "incoming" | "outgoing" | null;
  pendingHumanActions: number;
  messageCount?: number;
  matchCity?: string | null;
  matchDatingGoal?: string | null;
  matchSharedInstagram?: boolean;
  matchSharedWhatsapp?: boolean;
  userSharedInstagram?: boolean;
  userSharedWhatsapp?: boolean;
  semanticStage?: ConversationStageTag | null;
  semanticTone?: ConversationToneTag | null;
  semanticSource?: "rule-based" | "unknown";
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

export function safeMatchPhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1600) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && /(^|\.)(?:gotinder|tinder)\.com$/i.test(url.hostname) ? url.href : null;
  } catch { return null; }
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
    matchPhotoUrl: safeMatchPhotoUrl(input.matchPhotoUrl),
    matchAge: typeof input.matchAge === "number" && Number.isInteger(input.matchAge) && input.matchAge >= 18 && input.matchAge <= 120 ? input.matchAge : null,
    status: input.status,
    currentTopic: typeof input.currentTopic === "string" ? input.currentTopic : null,
    lastMessageAt: typeof input.lastMessageAt === "string" ? input.lastMessageAt : null,
    lastMessageDirection: input.lastMessageDirection === "incoming" || input.lastMessageDirection === "outgoing" ? input.lastMessageDirection : null,
    pendingHumanActions:
      typeof input.pendingHumanActions === "number" && input.pendingHumanActions >= 0
        ? Math.floor(input.pendingHumanActions)
        : 0,
    messageCount: typeof input.messageCount === "number" && Number.isInteger(input.messageCount) && input.messageCount >= 0 ? input.messageCount : 0,
    matchCity: typeof input.matchCity === "string" ? input.matchCity.slice(0, 200) : null,
    matchDatingGoal: typeof input.matchDatingGoal === "string" ? input.matchDatingGoal.slice(0, 120) : null,
    matchSharedInstagram: input.matchSharedInstagram === true,
    matchSharedWhatsapp: input.matchSharedWhatsapp === true,
    userSharedInstagram: input.userSharedInstagram === true,
    userSharedWhatsapp: input.userSharedWhatsapp === true,
    semanticStage: typeof input.semanticStage === "string" && semanticStages.includes(input.semanticStage as ConversationStageTag) ? input.semanticStage as ConversationStageTag : null,
    semanticTone: typeof input.semanticTone === "string" && semanticTones.includes(input.semanticTone as ConversationToneTag) ? input.semanticTone as ConversationToneTag : null,
    semanticSource: input.semanticSource === "rule-based" ? "rule-based" : "unknown",
  };
}
