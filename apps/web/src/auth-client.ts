export interface AuthSession {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export class AuthApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AuthApiError";
  }
}

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  const response = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password
    })
  });

  const payload = await parseJson<AuthSession | { error?: string }>(response);
  if (!response.ok) {
    const message = payload && "error" in payload && payload.error ? payload.error : "Unable to sign in.";
    throw new AuthApiError(message, response.status);
  }

  const session = payload as AuthSession | null;
  if (!session?.token || !session.user?.email) {
    throw new AuthApiError("Invalid authentication response.", 502);
  }
  return session;
}

export async function logout(session: AuthSession): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/auth/logout`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (response.ok || response.status === 404 || response.status === 401) return;
  const payload = await parseJson<{ error?: string }>(response);
  throw new AuthApiError(payload?.error ?? "Unable to sign out.", response.status);
}

export function persistSession(session: AuthSession): void {
  sessionStorage.setItem("tnnd:web:auth-session", JSON.stringify(session));
}

export function readSession(): AuthSession | null {
  const raw = sessionStorage.getItem("tnnd:web:auth-session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.token || !parsed.user?.email) {
      clearSession();
      return null;
    }
    if (Number.isFinite(Date.parse(parsed.expiresAt)) && Date.parse(parsed.expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem("tnnd:web:auth-session");
}
