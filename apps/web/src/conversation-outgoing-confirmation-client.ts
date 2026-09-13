import type { AuthSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export interface OutgoingConfirmation {
  accepted: boolean;
  conversationId: string;
  externalMessageId: string;
  temporaryInstructionConsumed: boolean;
  temporaryInstructionScope: TemporaryInstructionScope | null;
  temporaryInstructionRemaining: number | null;
}

export async function confirmConversationOutgoingMessage(
  session: AuthSession,
  conversationId: string,
  input: { externalMessageId: string; text: string; sentAt: string }
): Promise<OutgoingConfirmation> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/outgoing/confirm`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => null) as { confirmation?: OutgoingConfirmation; error?: string } | null;
  if (!response.ok || !payload?.confirmation) {
    throw new Error(payload?.error ?? "Unable to confirm the outgoing message.");
  }
  return payload.confirmation;
}
