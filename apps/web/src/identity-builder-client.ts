import type { AuthSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export interface IdentityStructuredAnalysis {
  summary: string;
  stableFacts: string[];
  interests: string[];
  lifestyle: string[];
  preferences: string[];
  personalityTraits: string[];
  conversationTopics: string[];
  avoidTopics: string[];
}

export interface IdentityBuilderState {
  sourceText: string;
  sourceHash: string;
  analysis: IdentityStructuredAnalysis;
  reviewStatus: "draft" | "approved";
  analysisModel: string;
  analyzedAt: string;
  approvedAt: string | null;
}

async function request<T>(session: AuthSession, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${session.token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers
    }
  });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? "Identity Builder request failed.");
  return payload;
}

export async function loadIdentityBuilder(session: AuthSession): Promise<IdentityBuilderState | null> {
  return (await request<{ state: IdentityBuilderState | null }>(session, "/api/v1/profile/identity-builder")).state;
}

export async function analyzeIdentity(session: AuthSession, sourceText: string): Promise<{ state: IdentityBuilderState; cached: boolean }> {
  return request(session, "/api/v1/profile/identity-builder/analyze", {
    method: "POST",
    body: JSON.stringify({ sourceText })
  });
}

export async function approveIdentity(session: AuthSession, analysis: IdentityStructuredAnalysis): Promise<IdentityBuilderState> {
  return (await request<{ state: IdentityBuilderState }>(session, "/api/v1/profile/identity-builder/approve", {
    method: "POST",
    body: JSON.stringify({ analysis })
  })).state;
}
