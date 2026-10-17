import type { AuthSession } from "./auth-client";
import { isConversationStatus, knownHandoffPlatform, normalizeConversationListItem, safeMatchPhotoUrl, type ConversationListItem, type ConversationStatus } from "./conversation-contract";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export class ConversationApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ConversationApiError";
  }
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export async function listConversations(session: AuthSession): Promise<ConversationListItem[]> {
  const response = await fetch(`${apiBase}/api/v1/conversations`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ conversations?: unknown[]; error?: string }>(response);
  if (!response.ok || !payload?.conversations) {
    throw new ConversationApiError(payload?.error ?? "Unable to load conversations.", response.status);
  }
  return payload.conversations.map(normalizeConversationListItem);
}

/** Search synced private message bodies on the authenticated backend; IDs only. */
export async function searchConversationContent(session: AuthSession, query: string): Promise<string[]> {
  const response = await fetch(apiBase + "/api/v1/conversations/search-content", {
    method: "POST",
    headers: { authorization: "Bearer " + session.token, "content-type": "application/json" },
    body: JSON.stringify({ query })
  });
  const payload = await parseJson<{ conversationIds?: unknown; error?: string }>(response);
  if (!response.ok || !Array.isArray(payload?.conversationIds)) {
    throw new ConversationApiError(payload?.error ?? "Unable to search conversation messages.", response.status);
  }
  return payload.conversationIds.filter((value): value is string => typeof value === "string");
}

export interface ConversationMessage {
  id: string;
  direction: "incoming" | "outgoing";
  text: string;
  sentAt: string;
}

export interface ConversationTopic {
  topic: string;
  subtopic?: string;
  confidence: number;
  messageCount?: number;
}

export interface ConversationTopicState {
  primaryTopic?: ConversationTopic;
  secondaryTopics: ConversationTopic[];
  recentTopics: ConversationTopic[];
}

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export interface TemporaryInstruction {
  text: string;
  scope: TemporaryInstructionScope;
  remainingReplies?: number;
}

export interface ConversationFlowStage { id: "greeting" | "check-in" | "location" | "occupation" | "interests" | "free-conversation"; status: "covered" | "next" | "later"; reason: "asked" | "known" | "mentioned" | "next" | "later"; }
export interface ConversationFlowState { stage: ConversationFlowStage["id"]; stages: ConversationFlowStage[]; known: Array<{ key: string; value: string }>; respondToLatestFirst: boolean; }

export interface MatchScreeningState {
  intent: "marriage" | "casual" | "long-term" | "unknown";
  action: "continue" | "clarify" | "pause";
  reason: string;
  evidence: "incoming-message" | "visible-profile" | "none";
  heightCm: number | null;
  confirmedByReply: boolean;
}
export interface ConversationDetail {
  matchScreening?: MatchScreeningState;
  id: string;
  displayName: string;
  userDisplayLabel?: string | null;
  userDisplayAge?: number | null;
  matchAge?: number | null;
  matchPhotoUrl?: string | null;
  status: ConversationStatus;
  handoffPlatform?: "instagram" | "whatsapp" | "snapchat" | "telegram" | null;
  currentTopic: string | null;
  topicState: ConversationTopicState;
  conversationFlow?: ConversationFlowState;
  pendingHumanActions?: number;
  temporaryInstruction?: TemporaryInstruction | null;
  messages: ConversationMessage[];
}

function isTemporaryInstructionScope(value: unknown): value is TemporaryInstructionScope {
  return value === "next-message" || value === "next-n-replies" || value === "until-cleared";
}

function normalizeTemporaryInstruction(value: unknown): TemporaryInstruction | null {
  if (value == null) return null;
  if (!value || typeof value !== "object") throw new Error("Temporary instruction must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.text !== "string" || !input.text.trim()) throw new Error("Temporary instruction text is required");
  if (!isTemporaryInstructionScope(input.scope)) throw new Error("Temporary instruction scope is invalid");
  const remainingReplies = typeof input.remainingReplies === "number" && Number.isFinite(input.remainingReplies)
    ? Math.max(1, Math.floor(input.remainingReplies))
    : undefined;
  return {
    text: input.text,
    scope: input.scope,
    ...(input.scope === "next-n-replies" && remainingReplies ? { remainingReplies } : {}),
    ...(input.scope === "next-message" ? { remainingReplies: 1 } : {})
  };
}

function normalizeMessage(value: unknown): ConversationMessage {
  if (!value || typeof value !== "object") throw new Error("Conversation message must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !input.id) throw new Error("Conversation message id is required");
  if (input.direction !== "incoming" && input.direction !== "outgoing") throw new Error("Conversation message direction is invalid");
  if (typeof input.text !== "string") throw new Error("Conversation message text is invalid");
  if (typeof input.sentAt !== "string" || !input.sentAt) throw new Error("Conversation message sentAt is required");
  return { id: input.id, direction: input.direction, text: input.text, sentAt: input.sentAt };
}

function normalizeTopic(value: unknown): ConversationTopic {
  if (!value || typeof value !== "object") throw new Error("Conversation topic must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.topic !== "string" || !input.topic.trim()) throw new Error("Conversation topic is required");
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : 0;
  const messageCount = typeof input.messageCount === "number" && Number.isFinite(input.messageCount)
    ? Math.max(0, Math.floor(input.messageCount))
    : undefined;
  return {
    topic: input.topic.trim(),
    ...(typeof input.subtopic === "string" && input.subtopic.trim() ? { subtopic: input.subtopic.trim() } : {}),
    confidence,
    ...(messageCount !== undefined ? { messageCount } : {})
  };
}

function normalizeTopicState(value: unknown): ConversationTopicState {
  if (!value || typeof value !== "object") return { secondaryTopics: [], recentTopics: [] };
  const input = value as Record<string, unknown>;
  const secondaryTopics = Array.isArray(input.secondaryTopics) ? input.secondaryTopics.map(normalizeTopic) : [];
  const recentTopics = Array.isArray(input.recentTopics) ? input.recentTopics.map(normalizeTopic) : [];
  return {
    ...(input.primaryTopic ? { primaryTopic: normalizeTopic(input.primaryTopic) } : {}),
    secondaryTopics,
    recentTopics
  };
}

/** Older backend builds do not return flow yet; keep detail rendering safe. */
function normalizeConversationFlow(value: unknown): ConversationFlowState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const ids = ["greeting", "check-in", "location", "occupation", "interests", "free-conversation"];
  if (!ids.includes(String(input.stage)) || !Array.isArray(input.stages)) return undefined;
  const stages: ConversationFlowStage[] = input.stages.flatMap(stage => {
    if (!stage || typeof stage !== "object") return [];
    const item = stage as Record<string, unknown>;
    if (!ids.includes(String(item.id)) || !["covered", "next", "later"].includes(String(item.status))
      || !["asked", "known", "mentioned", "next", "later"].includes(String(item.reason))) return [];
    return [{ id: item.id as ConversationFlowStage["id"], status: item.status as ConversationFlowStage["status"],
      reason: item.reason as ConversationFlowStage["reason"] }];
  }).slice(0, 6);
  if (stages.length !== 6) return undefined;
  const known = Array.isArray(input.known) ? input.known.flatMap(fact => {
    if (!fact || typeof fact !== "object") return [];
    const f = fact as Record<string, unknown>;
    return typeof f.key === "string" && typeof f.value === "string"
      ? [{ key: f.key.slice(0, 60), value: f.value.slice(0, 120) }] : [];
  }).slice(0, 8) : [];
  return { stage: input.stage as ConversationFlowState["stage"], stages, known,
    respondToLatestFirst: input.respondToLatestFirst === true };
}

function normalizeMatchScreening(value: unknown): MatchScreeningState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const x = value as Record<string, unknown>;
  if (!["marriage", "casual", "long-term", "unknown"].includes(String(x.intent))
    || !["continue", "clarify", "pause"].includes(String(x.action))
    || !["incoming-message", "visible-profile", "none"].includes(String(x.evidence))) return undefined;
  return {
    intent: x.intent as MatchScreeningState["intent"],
    action: x.action as MatchScreeningState["action"],
    reason: typeof x.reason === "string" ? x.reason.slice(0, 100) : "",
    evidence: x.evidence as MatchScreeningState["evidence"],
    heightCm: typeof x.heightCm === "number" && Number.isInteger(x.heightCm) ? x.heightCm : null,
    confirmedByReply: x.confirmedByReply === true
  };
}
function normalizeConversationDetail(value: unknown): ConversationDetail {
  if (!value || typeof value !== "object") throw new Error("Conversation detail must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !input.id) throw new Error("Conversation id is required");
  if (typeof input.displayName !== "string" || !input.displayName) throw new Error("Conversation displayName is required");
  if (!isConversationStatus(input.status)) throw new Error("Conversation status is invalid");
  if (!Array.isArray(input.messages)) throw new Error("Conversation messages are required");
  const pendingHumanActions = typeof input.pendingHumanActions === "number" && input.pendingHumanActions >= 0
    ? Math.floor(input.pendingHumanActions)
    : 0;
  return {
    id: input.id,
    displayName: input.displayName,
    userDisplayLabel: typeof input.userDisplayLabel === "string" ? input.userDisplayLabel : null,
    userDisplayAge: typeof input.userDisplayAge === "number" && Number.isInteger(input.userDisplayAge) && input.userDisplayAge >= 18 && input.userDisplayAge <= 120 ? input.userDisplayAge : null,
    matchAge: typeof input.matchAge === "number" && Number.isInteger(input.matchAge) && input.matchAge >= 18 && input.matchAge <= 120 ? input.matchAge : null,
    matchPhotoUrl: safeMatchPhotoUrl(input.matchPhotoUrl),
    status: input.status,
    handoffPlatform: input.status === "moved-off-tinder" ? knownHandoffPlatform(input.handoffPlatform) : null,
    currentTopic: typeof input.currentTopic === "string" ? input.currentTopic : null,
    topicState: normalizeTopicState(input.topicState),
    conversationFlow: normalizeConversationFlow(input.conversationFlow),
    matchScreening: normalizeMatchScreening(input.matchScreening),
    pendingHumanActions,
    temporaryInstruction: normalizeTemporaryInstruction(input.temporaryInstruction),
    messages: input.messages.map(normalizeMessage)
  };
}

export async function getConversation(session: AuthSession, conversationId: string): Promise<ConversationDetail> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ conversation?: unknown; error?: string }>(response);
  if (!response.ok || !payload?.conversation) {
    throw new ConversationApiError(payload?.error ?? "Unable to load conversation.", response.status);
  }
  try {
    return normalizeConversationDetail(payload.conversation);
  } catch (error) {
    throw new ConversationApiError(error instanceof Error ? error.message : "Conversation response is invalid.", response.status);
  }
}

export async function updateConversationStatus(
  session: AuthSession,
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ status })
  });
  const payload = await parseJson<{ error?: string }>(response);
  if (!response.ok) {
    throw new ConversationApiError(payload?.error ?? "Unable to update conversation status.", response.status);
  }
}

export async function saveTemporaryInstruction(
  session: AuthSession,
  conversationId: string,
  instruction: TemporaryInstruction
): Promise<TemporaryInstruction> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/instruction`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(instruction)
  });
  const payload = await parseJson<{ instruction?: unknown; error?: string }>(response);
  if (!response.ok || !payload?.instruction) {
    throw new ConversationApiError(payload?.error ?? "Unable to save temporary instruction.", response.status);
  }
  const normalized = normalizeTemporaryInstruction(payload.instruction);
  if (!normalized) throw new ConversationApiError("Temporary instruction response is invalid.", response.status);
  return normalized;
}

export async function clearTemporaryInstruction(session: AuthSession, conversationId: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/instruction`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ error?: string }>(response);
  if (!response.ok) {
    throw new ConversationApiError(payload?.error ?? "Unable to clear temporary instruction.", response.status);
  }
}
/** This is a user-provided label, never claimed as a Tinder-confirmed profile. */
export async function saveConversationDisplayIdentity(
  session: AuthSession,
  conversationId: string,
  label: string,
  age: number | null
): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/identity`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ label, age })
  });
  const payload = await parseJson<{ error?: string }>(response);
  if (!response.ok) throw new ConversationApiError(payload?.error ?? "Unable to save chat name.", response.status);
}

/** Permanently delete one user-owned conversation from TNND (not from Tinder). */
export async function deleteConversation(session: AuthSession, conversationId: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!response.ok) {
    const payload = await parseJson<{ error?: string }>(response);
    throw new ConversationApiError(payload?.error ?? "Unable to delete conversation.", response.status);
  }
}
