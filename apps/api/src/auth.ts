import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const passwordVersion = "scrypt-v1";

export interface SessionToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string): string | null {
  if (password.length < 12) return "Password must contain at least 12 characters.";
  if (password.length > 256) return "Password is too long.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const validationError = validatePassword(password);
  if (validationError) throw new Error(validationError);

  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, keyLength) as Buffer;
  return `${passwordVersion}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, saltText, hashText] = encoded.split("$");
  if (version !== passwordVersion || !saltText || !hashText) return false;

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    const actual = await scrypt(password, salt, expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function createSessionToken(ttlMs = 30 * 24 * 60 * 60 * 1000): Promise<SessionToken> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("Session TTL must be positive.");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = Buffer.from(await scrypt(token, "tnnd-session-v1", 32) as Buffer).toString("base64url");
  return {
    token,
    tokenHash,
    expiresAt: new Date(Date.now() + ttlMs)
  };
}

export async function hashSessionToken(token: string): Promise<string> {
  if (!token) throw new Error("Session token is required.");
  return Buffer.from(await scrypt(token, "tnnd-session-v1", 32) as Buffer).toString("base64url");
}
