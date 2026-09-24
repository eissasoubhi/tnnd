import { getPool } from "./db-client.js";

export interface RetainedTextingStyleSourceExamples {
  examples: string;
  updatedAt: string;
}

export async function retainTextingStyleSourceExamples(userId: string, examples: string): Promise<RetainedTextingStyleSourceExamples> {
  const result = await getPool().query<{ examples: string; updated_at: Date }>(
    `INSERT INTO texting_style_source_examples (user_id, examples)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       examples = EXCLUDED.examples,
       updated_at = now()
     RETURNING examples, updated_at`,
    [userId, examples]
  );
  const row = result.rows[0];
  if (!row) throw new Error("texting_style_source_retention_failed");
  return { examples: row.examples, updatedAt: row.updated_at.toISOString() };
}

export async function getRetainedTextingStyleSourceExamples(userId: string): Promise<RetainedTextingStyleSourceExamples | null> {
  const result = await getPool().query<{ examples: string; updated_at: Date }>(
    "SELECT examples, updated_at FROM texting_style_source_examples WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  const row = result.rows[0];
  return row ? { examples: row.examples, updatedAt: row.updated_at.toISOString() } : null;
}

export async function deleteRetainedTextingStyleSourceExamples(userId: string): Promise<boolean> {
  const result = await getPool().query("DELETE FROM texting_style_source_examples WHERE user_id = $1", [userId]);
  return (result.rowCount ?? 0) > 0;
}
