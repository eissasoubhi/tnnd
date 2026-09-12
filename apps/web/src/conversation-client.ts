import type { AuthSession } from "./auth-client";
import { isConversationStatus, normalizeConversationListItem, type ConversationListItem, type ConversationStatus } from "./conversation-contract";

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

export interface ConversationMessage {
  id: string;
  direction: "incoming" | "outgoing";
  text: string;
  sentAt: string;
}

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export interface TemporaryInstruction {
  text: string;
  scope: TemporaryInstructionScope;
  remainingReplies?: number;
}

export interface ConversationDetail {
  id: string;
  displayName: string;
  status: ConversationStatus;
  currentTopic: string | null;
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
    status: input.status,
    currentTopic: typeof input.currentTopic === "string" ? input.currentTopic : null,
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
