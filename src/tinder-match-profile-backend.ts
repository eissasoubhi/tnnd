import type { BackendSession } from "./storage";
import type { TinderVisibleProfileSource } from "./tinder-match-profile-capture";

const DEFAULT_API_BASE = "http://127.0.0.1:4000";

export type MatchProfileUploadResult = {
  id: string;
  conversationId: string | null;
  capturedAt: string;
  expiresAt: string | null;
};

export class MatchProfileUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MatchProfileUploadError";
  }
}

export async function uploadVisibleMatchProfileCapture(
  session: BackendSession,
  capture: TinderVisibleProfileSource,
  options: { conversationId?: string | null; apiBase?: string } = {}
): Promise<MatchProfileUploadResult> {
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const response = await fetch(`${apiBase}/api/v1/match-profiles/capture`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      capture,
      ...(options.conversationId ? { conversationId: options.conversationId } : {})
    })
  });
  const payload = await response.json().catch(() => ({})) as {
    profile?: MatchProfileUploadResult;
    error?: string;
  };
  if (!response.ok || !payload.profile) {
    throw new MatchProfileUploadError(payload.error ?? "Unable to upload MatchProfile capture.", response.status);
  }
  return payload.profile;
}
