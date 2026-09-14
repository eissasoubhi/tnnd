import type { MatchProfileRecord } from "./match-profile-view-model.js";

export class MatchProfileApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MatchProfileApiError";
  }
}

type MatchProfileResponse = { profile?: MatchProfileRecord; error?: string };

async function parse(response: Response): Promise<MatchProfileResponse> {
  return response.json().catch(() => ({})) as Promise<MatchProfileResponse>;
}

export async function getConversationMatchProfile(
  apiBase: string,
  token: string,
  conversationId: string
): Promise<MatchProfileRecord | null> {
  const response = await fetch(`${apiBase}/api/v1/conversations/${encodeURIComponent(conversationId)}/match-profile`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null;
  const payload = await parse(response);
  if (!response.ok || !payload.profile) throw new MatchProfileApiError(payload.error ?? "Unable to load MatchProfile.", response.status);
  return payload.profile;
}

export async function promoteMatchProfile(
  apiBase: string,
  token: string,
  profileId: string,
  conversationId: string
): Promise<MatchProfileRecord> {
  const response = await fetch(`${apiBase}/api/v1/match-profiles/${encodeURIComponent(profileId)}/promote`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ conversationId })
  });
  const payload = await parse(response);
  if (!response.ok || !payload.profile) throw new MatchProfileApiError(payload.error ?? "Unable to promote MatchProfile.", response.status);
  return payload.profile;
}
