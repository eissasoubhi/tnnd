import { clearBackendSession, getBackendSession, saveBackendSession, saveSyncState, type BackendSession } from "./storage";

const DEFAULT_API_BASE = "http://127.0.0.1:4000";

export interface BackendLoginInput {
  email: string;
  password: string;
}

export class BackendApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BackendApiError";
  }
}

function apiBase(): string {
  return DEFAULT_API_BASE;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export async function loginBackend(input: BackendLoginInput): Promise<BackendSession> {
  await saveSyncState({ status: "connecting", pendingItems: 0, lastSyncedAt: null, message: null });
  try {
    const response = await fetch(`${apiBase()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: input.email.trim().toLowerCase(), password: input.password })
    });
    const payload = await parseJson<BackendSession & { error?: string }>(response);
    if (!response.ok || !payload?.token || !payload.expiresAt || !payload.user) {
      throw new BackendApiError(payload?.error ?? "Unable to connect extension to TNND.", response.status);
    }
    const session: BackendSession = { token: payload.token, expiresAt: payload.expiresAt, user: payload.user };
    await saveBackendSession(session);
    await saveSyncState({ status: "connected", pendingItems: 0, lastSyncedAt: new Date().toISOString(), message: null });
    return session;
  } catch (error) {
    await saveSyncState({ status: "error", pendingItems: 0, lastSyncedAt: null, message: error instanceof Error ? error.message : "Connection failed." });
    throw error;
  }
}

export async function validateBackendSession(): Promise<BackendSession | null> {
  const session = await getBackendSession();
  if (!session) {
    await saveSyncState({ status: "disconnected", pendingItems: 0, lastSyncedAt: null, message: null });
    return null;
  }
  const response = await fetch(`${apiBase()}/api/v1/auth/session`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!response.ok) {
    await clearBackendSession();
    await saveSyncState({ status: "disconnected", pendingItems: 0, lastSyncedAt: null, message: null });
    return null;
  }
  await saveSyncState({ status: "connected", pendingItems: 0, lastSyncedAt: new Date().toISOString(), message: null });
  return session;
}

export async function logoutBackend(): Promise<void> {
  const session = await getBackendSession();
  try {
    if (session) {
      await fetch(`${apiBase()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` }
      });
    }
  } finally {
    await clearBackendSession();
    await saveSyncState({ status: "disconnected", pendingItems: 0, lastSyncedAt: null, message: null });
  }
}
