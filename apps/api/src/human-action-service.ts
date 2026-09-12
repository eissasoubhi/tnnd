import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";

export type HumanActionSeverity = "info" | "action-required" | "decision-required" | "urgent";
export type HumanActionStatus = "pending" | "completed" | "ignored";

export interface HumanAction {
  id: string;
  conversationRef: string | null;
  conversationLabel: string;
  title: string;
  detail: string;
  severity: HumanActionSeverity;
  status: HumanActionStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

interface HumanActionRow {
  id: string;
  conversation_ref: string | null;
  conversation_label: string;
  title: string;
  detail: string;
  severity: HumanActionSeverity;
  status: HumanActionStatus;
  context_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

function mapRow(row: HumanActionRow): HumanAction {
  return {
    id: row.id,
    conversationRef: row.conversation_ref,
    conversationLabel: row.conversation_label,
    title: row.title,
    detail: row.detail,
    severity: row.severity,
    status: row.status,
    context: row.context_json ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null
  };
}

export async function listHumanActions(userId: string, status?: HumanActionStatus): Promise<HumanAction[]> {
  const values: unknown[] = [userId];
  const statusClause = status ? " AND status = $2" : "";
  if (status) values.push(status);
  const result = await getPool().query<HumanActionRow>(
    `SELECT id, conversation_ref, conversation_label, title, detail, severity, status,
            context_json, created_at, updated_at, resolved_at
       FROM human_actions
      WHERE user_id = $1${statusClause}
      ORDER BY CASE severity WHEN 'urgent' THEN 0 WHEN 'decision-required' THEN 1 WHEN 'action-required' THEN 2 ELSE 3 END,
               created_at DESC
      LIMIT 200`,
    values
  );
  return result.rows.map(mapRow);
}

export interface CreateHumanActionInput {
  conversationRef?: string;
  conversationLabel?: string;
  title: string;
  detail: string;
  severity: HumanActionSeverity;
  context?: Record<string, unknown>;
}

export async function createHumanAction(userId: string, input: CreateHumanActionInput): Promise<HumanAction> {
  const result = await getPool().query<HumanActionRow>(
    `INSERT INTO human_actions (
       id, user_id, conversation_ref, conversation_label, title, detail, severity, context_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, conversation_ref, conversation_label, title, detail, severity, status,
               context_json, created_at, updated_at, resolved_at`,
    [
      randomUUID(),
      userId,
      input.conversationRef?.trim() || null,
      input.conversationLabel?.trim() ?? "",
      input.title.trim(),
      input.detail.trim(),
      input.severity,
      JSON.stringify(input.context ?? {})
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error("human_action_insert_failed");
  return mapRow(row);
}

export async function updateHumanActionStatus(userId: string, actionId: string, status: HumanActionStatus): Promise<HumanAction | null> {
  const result = await getPool().query<HumanActionRow>(
    `UPDATE human_actions
        SET status = $3,
            updated_at = now(),
            resolved_at = CASE WHEN $3 = 'pending' THEN NULL ELSE now() END
      WHERE id = $1 AND user_id = $2
      RETURNING id, conversation_ref, conversation_label, title, detail, severity, status,
                context_json, created_at, updated_at, resolved_at`,
    [actionId, userId, status]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
