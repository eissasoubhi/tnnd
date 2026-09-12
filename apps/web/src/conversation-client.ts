import type { AuthSession } from "./auth-client";
import { normalizeConversationListItem, type ConversationListItem, type ConversationStatus } from "./conversation-contract";

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

export async function getConversation(session: AuthSession, conversationId: string): Promise<ConversationDetail> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ conversation?: ConversationDetail; error?: string }>(response);
  if (!response.ok || !payload?.conversation) {
    throw new ConversationApiError(payload?.error ?? "Unable to load conversation.", response.status);
  }
  return payload.conversation;
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
  const payload = await parseJson<{ instruction?: TemporaryInstruction; error?: string }>(response);
  if (!response.ok || !payload?.instruction) {
    throw new ConversationApiError(payload?.error ?? "Unable to save temporary instruction.", response.status);
  }
  return payload.instruction;
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
