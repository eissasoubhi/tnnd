import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";
import {
  parsePersonalMemoryStructuredAnalysis,
  type PersonalMemoryStructuredAnalysis
} from "./personal-memory-contract.js";

export type PersonalMemoryReviewStatus = "draft" | "approved";

export interface StoredPersonalMemory {
  id: string;
  originalText: string;
  structuredAnalysis: PersonalMemoryStructuredAnalysis;
  reviewStatus: PersonalMemoryReviewStatus;
  approvedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

type PersonalMemoryRow = {
  id: string;
  original_text: string;
  structured_analysis: unknown;
  review_status: PersonalMemoryReviewStatus;
  approved_at: Date | null;
  last_used_at: Date | null;
  usage_count: number;
  created_at: Date;
  updated_at: Date;
};

export function normalizePersonalMemoryOriginalText(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_original_text");
  const text = value.trim();
  if (!text || text.length > 20_000) throw new Error("invalid_original_text");
  return text;
}

export function normalizePersonalMemoryUsageIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error("invalid_personal_memory_usage_ids");
  const ids = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (ids.some((id) => !id)) throw new Error("invalid_personal_memory_usage_ids");
  return [...new Set(ids)];
}

export function canApprovePersonalMemory(analysis: PersonalMemoryStructuredAnalysis): boolean {
  return analysis.immutableFacts.length > 0 && Boolean(analysis.summary.trim()) && Boolean(analysis.title.trim());
}

function rowToStored(row: PersonalMemoryRow): StoredPersonalMemory {
  return {
    id: row.id,
    originalText: row.original_text,
    structuredAnalysis: parsePersonalMemoryStructuredAnalysis(row.structured_analysis),
    reviewStatus: row.review_status,
    approvedAt: row.approved_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    usageCount: row.usage_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

const returningColumns = `id, original_text, structured_analysis, review_status, approved_at,
  last_used_at, usage_count, created_at, updated_at`;

export async function createPersonalMemory(
  userId: string,
  originalTextValue: unknown,
  structuredAnalysisValue: unknown
): Promise<StoredPersonalMemory> {
  const originalText = normalizePersonalMemoryOriginalText(originalTextValue);
  const structuredAnalysis = parsePersonalMemoryStructuredAnalysis(structuredAnalysisValue);
  const result = await getPool().query<PersonalMemoryRow>(
    `INSERT INTO personal_memories (id, user_id, original_text, structured_analysis)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING ${returningColumns}`,
    [randomUUID(), userId, originalText, JSON.stringify(structuredAnalysis)]
  );
  const row = result.rows[0];
  if (!row) throw new Error("personal_memory_insert_failed");
  return rowToStored(row);
}

export async function listPersonalMemories(userId: string): Promise<StoredPersonalMemory[]> {
  const result = await getPool().query<PersonalMemoryRow>(
    `SELECT ${returningColumns}
       FROM personal_memories
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 500`,
    [userId]
  );
  return result.rows.map(rowToStored);
}

export async function getPersonalMemory(userId: string, memoryId: string): Promise<StoredPersonalMemory | null> {
  const result = await getPool().query<PersonalMemoryRow>(
    `SELECT ${returningColumns}
       FROM personal_memories
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [memoryId, userId]
  );
  return result.rows[0] ? rowToStored(result.rows[0]) : null;
}

export async function updatePersonalMemoryAnalysis(
  userId: string,
  memoryId: string,
  structuredAnalysisValue: unknown
): Promise<StoredPersonalMemory | null> {
  const structuredAnalysis = parsePersonalMemoryStructuredAnalysis(structuredAnalysisValue);
  const result = await getPool().query<PersonalMemoryRow>(
    `UPDATE personal_memories
        SET structured_analysis = $3::jsonb,
            review_status = 'draft',
            approved_at = NULL,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${returningColumns}`,
    [memoryId, userId, JSON.stringify(structuredAnalysis)]
  );
  return result.rows[0] ? rowToStored(result.rows[0]) : null;
}

export async function approvePersonalMemory(userId: string, memoryId: string): Promise<StoredPersonalMemory | null> {
  const current = await getPersonalMemory(userId, memoryId);
  if (!current) return null;
  if (!canApprovePersonalMemory(current.structuredAnalysis)) throw new Error("personal_memory_not_approvable");
  const result = await getPool().query<PersonalMemoryRow>(
    `UPDATE personal_memories
        SET review_status = 'approved',
            approved_at = COALESCE(approved_at, now()),
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${returningColumns}`,
    [memoryId, userId]
  );
  return result.rows[0] ? rowToStored(result.rows[0]) : null;
}

export async function markPersonalMemoriesUsed(
  userId: string,
  memoryIdsValue: unknown,
  usedAt = new Date()
): Promise<StoredPersonalMemory[]> {
  const memoryIds = normalizePersonalMemoryUsageIds(memoryIdsValue);
  const result = await getPool().query<PersonalMemoryRow>(
    `UPDATE personal_memories
        SET usage_count = usage_count + 1,
            last_used_at = $3,
            updated_at = now()
      WHERE user_id = $1
        AND id = ANY($2::uuid[])
        AND review_status = 'approved'
        AND structured_analysis->>'allowedForChat' = 'true'
      RETURNING ${returningColumns}`,
    [userId, memoryIds, usedAt]
  );
  const byId = new Map(result.rows.map((row) => [row.id, rowToStored(row)]));
  return memoryIds.flatMap((id) => byId.get(id) ?? []);
}

export async function deletePersonalMemory(userId: string, memoryId: string): Promise<boolean> {
  const result = await getPool().query(
    "DELETE FROM personal_memories WHERE id = $1 AND user_id = $2",
    [memoryId, userId]
  );
  return Boolean(result.rowCount);
}
