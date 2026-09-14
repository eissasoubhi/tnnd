import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";
import {
  normalizeMatchProfile,
  parseMatchProfileSourceCapture,
  type MatchProfileSourceCapture,
  type NormalizedMatchProfile
} from "./match-profile-contract.js";

export type StoredMatchProfile = {
  id: string;
  sourceCapture: MatchProfileSourceCapture;
  normalizedProfile: NormalizedMatchProfile;
  conversationId: string | null;
  capturedAt: string;
  expiresAt: string | null;
  updatedAt: string;
};

type MatchProfileRow = {
  id: string;
  conversation_id: string | null;
  source_capture: unknown;
  normalized_profile: unknown;
  captured_at: Date;
  expires_at: Date | null;
  updated_at: Date;
};

function rowToStored(row: MatchProfileRow): StoredMatchProfile {
  return {
    id: row.id,
    sourceCapture: parseMatchProfileSourceCapture(row.source_capture),
    normalizedProfile: row.normalized_profile as NormalizedMatchProfile,
    conversationId: row.conversation_id,
    capturedAt: row.captured_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString()
  };
}

function stableCaptureContent(capture: MatchProfileSourceCapture): string {
  return JSON.stringify({
    source: capture.source,
    captureMode: capture.captureMode,
    route: capture.route,
    visibleFields: capture.visibleFields
  });
}

export function sameMatchProfileCaptureContent(
  left: MatchProfileSourceCapture,
  right: MatchProfileSourceCapture
): boolean {
  return stableCaptureContent(left) === stableCaptureContent(right);
}

export function isPromotableTemporaryMatchProfile(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt === null || expiresAt.getTime() > now.getTime();
}

async function assertConversationOwnership(userId: string, conversationId: string): Promise<boolean> {
  const result = await getPool().query(
    "SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1",
    [conversationId, userId]
  );
  return Boolean(result.rowCount);
}

async function findEquivalentTemporaryCapture(
  userId: string,
  sourceCapture: MatchProfileSourceCapture,
  now: Date
): Promise<StoredMatchProfile | null> {
  const candidates = await getPool().query<MatchProfileRow>(
    `SELECT id, conversation_id, source_capture, normalized_profile, captured_at, expires_at, updated_at
     FROM match_profiles
     WHERE user_id = $1
       AND conversation_id IS NULL
       AND source = $2
       AND (expires_at IS NULL OR expires_at > $3)
     ORDER BY captured_at DESC
     LIMIT 20`,
    [userId, sourceCapture.source, now.toISOString()]
  );
  const row = candidates.rows.find((candidate) =>
    sameMatchProfileCaptureContent(parseMatchProfileSourceCapture(candidate.source_capture), sourceCapture)
  );
  return row ? rowToStored(row) : null;
}

export async function saveMatchProfileCapture(
  userId: string,
  value: unknown,
  options: { conversationId?: string | null; now?: Date } = {}
): Promise<StoredMatchProfile | null> {
  const sourceCapture = parseMatchProfileSourceCapture(value);
  const conversationId = options.conversationId?.trim() || null;
  const now = options.now ?? new Date();
  if (conversationId && !(await assertConversationOwnership(userId, conversationId))) return null;

  if (!conversationId) {
    const duplicate = await findEquivalentTemporaryCapture(userId, sourceCapture, now);
    if (duplicate) return duplicate;
  }

  const normalizedProfile = normalizeMatchProfile(sourceCapture, {
    conversationRef: conversationId,
    now
  });
  const id = randomUUID();
  const result = await getPool().query<MatchProfileRow>(
    `INSERT INTO match_profiles (
       id, user_id, conversation_id, source, source_capture, normalized_profile, captured_at, expires_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
     ON CONFLICT (user_id, conversation_id) WHERE conversation_id IS NOT NULL
     DO UPDATE SET
       source_capture = EXCLUDED.source_capture,
       normalized_profile = EXCLUDED.normalized_profile,
       captured_at = EXCLUDED.captured_at,
       expires_at = NULL,
       updated_at = now()
     RETURNING id, conversation_id, source_capture, normalized_profile, captured_at, expires_at, updated_at`,
    [
      id,
      userId,
      conversationId,
      sourceCapture.source,
      JSON.stringify(sourceCapture),
      JSON.stringify(normalizedProfile),
      sourceCapture.capturedAt,
      normalizedProfile.retention.expiresAt
    ]
  );
  return rowToStored(result.rows[0]!);
}

export async function getConversationMatchProfile(
  userId: string,
  conversationId: string
): Promise<StoredMatchProfile | null> {
  const result = await getPool().query<MatchProfileRow>(
    `SELECT id, conversation_id, source_capture, normalized_profile, captured_at, expires_at, updated_at
     FROM match_profiles
     WHERE user_id = $1 AND conversation_id = $2
     LIMIT 1`,
    [userId, conversationId]
  );
  return result.rows[0] ? rowToStored(result.rows[0]) : null;
}

export async function promoteMatchProfileCapture(
  userId: string,
  profileId: string,
  conversationId: string
): Promise<StoredMatchProfile | null> {
  if (!(await assertConversationOwnership(userId, conversationId))) return null;
  const existing = await getPool().query<MatchProfileRow>(
    `SELECT id, conversation_id, source_capture, normalized_profile, captured_at, expires_at, updated_at
     FROM match_profiles
     WHERE id = $1 AND user_id = $2 AND conversation_id IS NULL
     LIMIT 1`,
    [profileId, userId]
  );
  const row = existing.rows[0];
  if (!row || !isPromotableTemporaryMatchProfile(row.expires_at)) return null;

  const sourceCapture = parseMatchProfileSourceCapture(row.source_capture);
  const normalizedProfile = normalizeMatchProfile(sourceCapture, { conversationRef: conversationId });
  const updated = await getPool().query<MatchProfileRow>(
    `UPDATE match_profiles
     SET conversation_id = $1,
         normalized_profile = $2::jsonb,
         expires_at = NULL,
         updated_at = now()
     WHERE id = $3
       AND user_id = $4
       AND conversation_id IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     RETURNING id, conversation_id, source_capture, normalized_profile, captured_at, expires_at, updated_at`,
    [conversationId, JSON.stringify(normalizedProfile), profileId, userId]
  );
  return updated.rows[0] ? rowToStored(updated.rows[0]) : null;
}

export async function deleteExpiredTemporaryMatchProfiles(now = new Date()): Promise<number> {
  const result = await getPool().query(
    `DELETE FROM match_profiles
     WHERE conversation_id IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= $1`,
    [now.toISOString()]
  );
  return result.rowCount ?? 0;
}
