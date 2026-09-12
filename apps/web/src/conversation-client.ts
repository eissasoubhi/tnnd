import type { AuthSession } from "./auth-client";
import { normalizeConversationListItem, type ConversationListItem } from "./conversation-contract";

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

export interface ConversationDetail {
  id: string;
  displayName: string;
  status: ConversationListItem["status"];
  currentTopic: string | null;
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
