import { readSession } from "./auth-client";
import type { HumanActionItem, HumanActionStatus } from "./action-center";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export async function fetchHumanActions(): Promise<HumanActionItem[] | null> {
  const session = readSession();
  if (!session) return null;
  const response = await fetch(`${apiBase}/api/v1/human-actions`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ actions?: HumanActionItem[]; error?: string }>(response);
  if (!response.ok || !payload?.actions) throw new Error(payload?.error ?? "Unable to load actions.");
  return payload.actions;
}

export async function setHumanActionStatus(id: string, status: HumanActionStatus): Promise<HumanActionItem | null> {
  const session = readSession();
  if (!session) return null;
  const response = await fetch(`${apiBase}/api/v1/human-actions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
    body: JSON.stringify({ status })
  });
  const payload = await parseJson<{ action?: HumanActionItem; error?: string }>(response);
  if (!response.ok || !payload?.action) throw new Error(payload?.error ?? "Unable to update action.");
  return payload.action;
}
