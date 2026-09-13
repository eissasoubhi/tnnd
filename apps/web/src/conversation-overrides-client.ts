import type { AuthSession } from "./auth-client";
import type { ConversationOverridesPayload } from "./conversation-overrides-model";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function normalizeOverrides(value: unknown): ConversationOverridesPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Conversation overrides response is invalid.");
  return value as ConversationOverridesPayload;
}

export async function getConversationOverrides(session: AuthSession, conversationId: string): Promise<ConversationOverridesPayload> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/overrides`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ overrides?: unknown; error?: string }>(response);
  if (!response.ok || payload?.overrides === undefined) throw new Error(payload?.error ?? "Unable to load chat overrides.");
  return normalizeOverrides(payload.overrides);
}

export async function saveConversationOverrides(
  session: AuthSession,
  conversationId: string,
  overrides: ConversationOverridesPayload
): Promise<ConversationOverridesPayload> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/overrides`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ overrides })
  });
  const payload = await parseJson<{ overrides?: unknown; error?: string; details?: string }>(response);
  if (!response.ok || payload?.overrides === undefined) throw new Error(payload?.details ?? payload?.error ?? "Unable to save chat overrides.");
  return normalizeOverrides(payload.overrides);
}

export async function clearConversationOverrides(session: AuthSession, conversationId: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/overrides`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ error?: string }>(response);
  if (!response.ok) throw new Error(payload?.error ?? "Unable to clear chat overrides.");
}
