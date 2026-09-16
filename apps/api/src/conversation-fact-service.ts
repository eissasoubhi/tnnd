import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";

export type ConversationFactSubject = "match" | "user" | "shared";

export interface ConversationFactInput {
  subject: ConversationFactSubject;
  key: string;
  value: string;
  confidence: number;
  sourceMessageIds: string[];
}

export interface ConversationFact extends ConversationFactInput {
  id: string;
  firstObservedAt: string;
  lastObservedAt: string;
  updatedAt: string;
}

function normalizeFact(input: ConversationFactInput): ConversationFactInput | null {
  const key = input.key.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 120);
  const value = input.value.trim().slice(0, 1000);
  const sourceMessageIds = [...new Set(input.sourceMessageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 20);
  if (!key || !value || sourceMessageIds.length === 0) return null;
  return {
    subject: input.subject,
    key,
    value,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    sourceMessageIds
  };
}

export async function upsertConversationFacts(
  conversationId: string,
  facts: ConversationFactInput[],
  observedAt: Date = new Date()
): Promise<void> {
  const normalized = facts.map(normalizeFact).filter((fact): fact is ConversationFactInput => fact !== null).slice(0, 30);
  if (!normalized.length) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const fact of normalized) {
      await client.query(
        `INSERT INTO conversation_facts
           (id, conversation_id, subject, fact_key, fact_value, confidence, source_message_ids, first_observed_at, last_observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
         ON CONFLICT (conversation_id, subject, fact_key) DO UPDATE
         SET fact_value = EXCLUDED.fact_value,
             confidence = EXCLUDED.confidence,
             source_message_ids = EXCLUDED.source_message_ids,
             last_observed_at = EXCLUDED.last_observed_at,
             updated_at = now()`,
        [randomUUID(), conversationId, fact.subject, fact.key, fact.value, fact.confidence, JSON.stringify(fact.sourceMessageIds), observedAt]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listConversationFacts(conversationId: string, limit = 30): Promise<ConversationFact[]> {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const result = await getPool().query<{
    id: string;
    subject: ConversationFactSubject;
    fact_key: string;
    fact_value: string;
    confidence: number;
    source_message_ids: unknown;
    first_observed_at: Date;
    last_observed_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, subject, fact_key, fact_value, confidence, source_message_ids,
            first_observed_at, last_observed_at, updated_at
     FROM conversation_facts
     WHERE conversation_id = $1
     ORDER BY confidence DESC, last_observed_at DESC
     LIMIT $2`,
    [conversationId, boundedLimit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    key: row.fact_key,
    value: row.fact_value,
    confidence: Number(row.confidence),
    sourceMessageIds: Array.isArray(row.source_message_ids)
      ? row.source_message_ids.filter((id): id is string => typeof id === "string")
      : [],
    firstObservedAt: row.first_observed_at.toISOString(),
    lastObservedAt: row.last_observed_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));
}
