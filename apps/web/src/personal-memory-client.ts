import type { AuthSession } from "./auth-client";
import type { PersonalMemoryRecord } from "./personal-memory-library";
import type { PersonalMemoryReviewDraft } from "./personal-memory-review";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

type MemoryPayload = { memory?: PersonalMemoryRecord; memories?: PersonalMemoryRecord[]; ok?: boolean; error?: string; details?: string };

async function request(session: AuthSession, path: string, init: RequestInit = {}): Promise<MemoryPayload> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${session.token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers
    }
  });
  const payload = await response.json().catch(() => null) as MemoryPayload | null;
  if (!response.ok || !payload) throw new Error(payload?.details ?? payload?.error ?? "Personal Memory request failed.");
  return payload;
}

export async function listPersonalMemories(session: AuthSession): Promise<PersonalMemoryRecord[]> {
  return (await request(session, "/api/v1/personal-memories")).memories ?? [];
}

export async function getPersonalMemory(session: AuthSession, id: string): Promise<PersonalMemoryRecord> {
  const payload = await request(session, `/api/v1/personal-memories/${encodeURIComponent(id)}`);
  if (!payload.memory) throw new Error("Personal Memory response is missing the memory.");
  return payload.memory;
}

export async function createPersonalMemory(session: AuthSession, draft: PersonalMemoryReviewDraft): Promise<PersonalMemoryRecord> {
  const payload = await request(session, "/api/v1/personal-memories", { method: "POST", body: JSON.stringify(draft) });
  if (!payload.memory) throw new Error("Personal Memory response is missing the memory.");
  return payload.memory;
}

export async function updatePersonalMemory(session: AuthSession, id: string, draft: PersonalMemoryReviewDraft): Promise<PersonalMemoryRecord> {
  const payload = await request(session, `/api/v1/personal-memories/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(draft) });
  if (!payload.memory) throw new Error("Personal Memory response is missing the memory.");
  return payload.memory;
}

export async function approvePersonalMemory(session: AuthSession, id: string): Promise<PersonalMemoryRecord> {
  const payload = await request(session, `/api/v1/personal-memories/${encodeURIComponent(id)}/approve`, { method: "POST" });
  if (!payload.memory) throw new Error("Personal Memory response is missing the memory.");
  return payload.memory;
}

export async function deletePersonalMemory(session: AuthSession, id: string): Promise<void> {
  await request(session, `/api/v1/personal-memories/${encodeURIComponent(id)}`, { method: "DELETE" });
}
