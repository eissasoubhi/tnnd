import type { AuthSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export interface ConversationGeneration {
  reply: string;
  model: string;
  context: unknown;
}

export async function generateConversationReply(
  session: AuthSession,
  conversationId: string,
  latestMessage: string
): Promise<ConversationGeneration> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/generate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ latestMessage })
  });
  const payload = await response.json().catch(() => null) as { generation?: ConversationGeneration; error?: string; details?: string } | null;
  if (!response.ok || !payload?.generation) {
    throw new Error(payload?.details ?? payload?.error ?? "Unable to generate a reply.");
  }
  return payload.generation;
}
