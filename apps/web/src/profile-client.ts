import { AuthApiError, readSession } from "./auth-client";
import type { ImportedProfile } from "./profile-import";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export class ProfileApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ProfileApiError";
  }
}

function authorization(): Record<string, string> {
  const session = readSession();
  if (!session) throw new AuthApiError("Sign in to sync your profile.", 401);
  return { authorization: `Bearer ${session.token}` };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export async function fetchProfile(): Promise<ImportedProfile | null> {
  const response = await fetch(`${apiBase}/api/v1/profile`, { headers: authorization() });
  if (response.status === 404) return null;
  const payload = await parseJson<{ profile?: ImportedProfile; error?: string }>(response);
  if (!response.ok) throw new ProfileApiError(payload?.error ?? "Unable to load profile.", response.status);
  if (!payload?.profile) throw new ProfileApiError("Invalid profile response.", 502);
  return payload.profile;
}

export async function saveProfile(profile: ImportedProfile): Promise<ImportedProfile> {
  const response = await fetch(`${apiBase}/api/v1/profile`, {
    method: "PUT",
    headers: { ...authorization(), "content-type": "application/json" },
    body: JSON.stringify({ profile })
  });
  const payload = await parseJson<{ profile?: ImportedProfile; error?: string; details?: string[] }>(response);
  if (!response.ok) {
    const details = payload?.details?.length ? ` ${payload.details.join(" ")}` : "";
    throw new ProfileApiError(`${payload?.error ?? "Unable to save profile."}${details}`, response.status);
  }
  if (!payload?.profile) throw new ProfileApiError("Invalid profile response.", 502);
  return payload.profile;
}
