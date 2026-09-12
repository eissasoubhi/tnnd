import { randomUUID } from "node:crypto";
import { createSessionToken, normalizeEmail, verifyPassword } from "./auth.js";
import { getPool } from "./db-client.js";

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

export async function loginWithPassword(emailInput: string, password: string): Promise<LoginResult | null> {
  const email = normalizeEmail(emailInput);
  if (!email || !password) return null;

  const pool = getPool();
  const userResult = await pool.query<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  const user = userResult.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;

  const session = await createSessionToken();
  await pool.query(
    `INSERT INTO extension_sessions (id, user_id, device_label, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), user.id, "web", session.tokenHash, session.expiresAt]
  );

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

export async function revokeSession(tokenHash: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE extension_sessions
     SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return (result.rowCount ?? 0) > 0;
}
