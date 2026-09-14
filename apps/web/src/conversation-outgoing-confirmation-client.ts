import type { AuthSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export interface OutgoingConfirmation {
  accepted: boolean;
  conversationId: string;
  externalMessageId: string;
  temporaryInstructionConsumed: boolean;
  temporaryInstructionScope: TemporaryInstructionScope | null;
  temporaryInstructionRemaining: number | null;
}

export interface OutgoingConfirmationRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function shouldRetryStatus(status: number): boolean {
  return retryableStatuses.has(status);
}

export async function confirmConversationOutgoingMessage(
  session: AuthSession,
  conversationId: string,
  input: { externalMessageId: string; text: string; sentAt: string },
  retryOptions: OutgoingConfirmationRetryOptions = {}
): Promise<OutgoingConfirmation> {
  const maxAttempts = Math.max(1, Math.min(4, retryOptions.maxAttempts ?? 3));
  const baseDelayMs = Math.max(100, retryOptions.baseDelayMs ?? 350);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/outgoing/confirm`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("Unable to confirm the outgoing message.");
      if (attempt === maxAttempts) throw normalized;
      lastError = normalized;
      await wait(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }

    const payload = await response.json().catch(() => null) as { confirmation?: OutgoingConfirmation; error?: string } | null;
    if (response.ok && payload?.confirmation) return payload.confirmation;

    const error = new Error(payload?.error ?? "Unable to confirm the outgoing message.");
    if (!shouldRetryStatus(response.status) || attempt === maxAttempts) throw error;
    lastError = error;
    await wait(baseDelayMs * 2 ** (attempt - 1));
  }

  throw lastError ?? new Error("Unable to confirm the outgoing message.");
}
