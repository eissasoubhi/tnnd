export interface AuthSession {
  accessToken: string;
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

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  const response = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password
    })
  });

  const payload = await response.json().catch(() => null) as AuthSession | { error?: string } | null;
  if (!response.ok) {
    const message = payload && "error" in payload && payload.error ? payload.error : "Unable to sign in.";
    throw new AuthApiError(message, response.status);
  }

  return payload as AuthSession;
}

export function persistSession(session: AuthSession): void {
  sessionStorage.setItem("tnnd:web:auth-session", JSON.stringify(session));
}

export function readSession(): AuthSession | null {
  const raw = sessionStorage.getItem("tnnd:web:auth-session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed.accessToken && parsed.user?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem("tnnd:web:auth-session");
}
