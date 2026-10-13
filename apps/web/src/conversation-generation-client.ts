import { cleanDraftText } from "./conversation-draft-text";
import type { AuthSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export interface ConversationGeneration {
  conversationId: string;
  text: string;
  model: string;
  provenance: {
    overriddenFields: string[];
    hasPersistentInstruction: boolean;
    hasTemporaryInstruction: boolean;
    hasPreviewInstruction?: boolean;
    adaptiveStyle?: { effective: Record<string, unknown>; autoFields: string[]; reasons: Record<string, string> };
  };
}

export class DraftGenerationError extends Error {
  constructor(readonly code: string, readonly httpStatus: number | undefined, readonly stage?: string) {
    super(code);
    this.name = "DraftGenerationError";
  }
}

export async function generateConversationReply(
  session: AuthSession,
  conversationId: string,
  latestMessage: string,
  previewInstruction?: string
): Promise<ConversationGeneration> {
  const normalizedPreviewInstruction = previewInstruction?.trim();
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/generate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ...(latestMessage.trim() ? { latestMessage: latestMessage.trim() } : {}),
      ...(normalizedPreviewInstruction ? { previewInstruction: normalizedPreviewInstruction } : {})
    })
  });
  const payload = await response.json().catch(() => null) as { generation?: ConversationGeneration; error?: string; details?: string; stage?: string } | null;
  if (!response.ok || !payload?.generation) {
    throw new DraftGenerationError(payload?.error ?? "generation_failed", response.status, payload?.stage);
  }
  // Validate even successful API responses: old API versions could place
  // truncated JSON directly in generation.text and accidentally copy it.
  try {
    return { ...payload.generation, text: cleanDraftText(payload.generation.text) };
  } catch {
    throw new DraftGenerationError("gemini_invalid_output", 502);
  }
}
