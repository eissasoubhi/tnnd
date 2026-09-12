import { randomUUID } from "node:crypto";
import { createSessionToken, hashPassword, normalizeEmail, validatePassword, verifyPassword } from "./auth.js";
import { getPool } from "./db-client.js";

const ACTIVE_SESSION_LIMIT = 20;

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: { id: string; email: string };
}

export interface AuthenticatedSession {
  sessionId: string;
  user: { id: string; email: string };
  expiresAt: string;
}

export interface AccountSession {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface LoginClientInfo {
  clientType?: "web" | "extension";
  deviceLabel?: string;
}

export type RegisterResult =
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; error: "invalid_email" | "invalid_password" | "email_already_exists"; details?: string };

export async function registerAccount(emailInput: string, password: string): Promise<RegisterResult> {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@") || email.length > 320) return { ok: false, error: "invalid_email" };
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: "invalid_password", details: passwordError };

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await getPool().query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
      [id, email, passwordHash]
    );
    return { ok: true, user: { id, email } };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (code === "23505") return { ok: false, error: "email_already_exists" };
    throw error;
  }
}

async function markExpiredSessionsRevoked(userId: string): Promise<void> {
  await getPool().query(
    `UPDATE extension_sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at <= now()`,
    [userId]
  );
}

async function enforceActiveSessionLimit(userId: string): Promise<void> {
  await getPool().query(
    `WITH overflow AS (
       SELECT id
       FROM extension_sessions
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC, id DESC
       OFFSET $2
     )
     UPDATE extension_sessions
        SET revoked_at = now()
      WHERE id IN (SELECT id FROM overflow)`,
    [userId, ACTIVE_SESSION_LIMIT]
  );
}

export async function loginWithPassword(emailInput: string, password: string, client: LoginClientInfo = {}): Promise<LoginResult | null> {
  const email = normalizeEmail(emailInput);
  if (!email || !password) return null;
  const pool = getPool();
  const userResult = await pool.query<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  const user = userResult.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;

  await markExpiredSessionsRevoked(user.id);
  const session = await createSessionToken();
  const clientType = client.clientType ?? "web";
  const customLabel = client.deviceLabel?.trim().slice(0, 120);
  const deviceLabel = customLabel ? `${clientType}:${customLabel}` : clientType;
  await pool.query(
    `INSERT INTO extension_sessions (id, user_id, device_label, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), user.id, deviceLabel, session.tokenHash, session.expiresAt]
  );
  await enforceActiveSessionLimit(user.id);

  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: { id: user.id, email: user.email }
  };
}

export async function authenticateSession(tokenHash: string): Promise<AuthenticatedSession | null> {
  const result = await getPool().query<{
    session_id: string;
    user_id: string;
    email: string;
    expires_at: Date;
  }>(
    `UPDATE extension_sessions AS session
     SET last_seen_at = now()
     FROM users
     WHERE session.token_hash = $1
       AND session.user_id = users.id
       AND session.revoked_at IS NULL
       AND session.expires_at > now()
     RETURNING session.id AS session_id, users.id AS user_id, users.email, session.expires_at`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    user: { id: row.user_id, email: row.email },
    expiresAt: row.expires_at.toISOString()
  };
}

export async function listAccountSessions(userId: string, currentSessionId: string): Promise<AccountSession[]> {
  await markExpiredSessionsRevoked(userId);
  const result = await getPool().query<{
    id: string;
    device_label: string | null;
    created_at: Date;
    last_seen_at: Date;
    expires_at: Date;
  }>(
    `SELECT id, device_label, created_at, last_seen_at, expires_at
     FROM extension_sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_seen_at DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    deviceLabel: row.device_label,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    current: row.id === currentSessionId
  }));
}

export async function revokeAccountSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE extension_sessions
     SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function revokeSession(tokenHash: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE extension_sessions
     SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return (result.rowCount ?? 0) > 0;
}
