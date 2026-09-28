import type { QueryResultRow } from "pg";
import { verifyPassword } from "./auth.js";
import { getPool } from "./db-client.js";

export type AccountDeletionResult = "deleted" | "invalid_password" | "not_found";

export type AccountDeletionQuery = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[]
) => Promise<{ rows: T[]; rowCount: number | null }>;

export type AccountPasswordVerifier = (
  password: string,
  encoded: string
) => Promise<boolean>;

function defaultQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[]
) {
  return getPool().query<T>(text, values);
}

export async function deleteAccountWithPassword(
  userId: string,
  password: string,
  query: AccountDeletionQuery = defaultQuery,
  verify: AccountPasswordVerifier = verifyPassword
): Promise<AccountDeletionResult> {
  const id = userId.trim();
  if (!id || !password) return "invalid_password";

  const account = await query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1 LIMIT 1",
    [id]
  );
  const row = account.rows[0];
  if (!row) return "not_found";

  if (!(await verify(password, row.password_hash))) return "invalid_password";

  const deleted = await query(
    "DELETE FROM users WHERE id = $1",
    [id]
  );
  return deleted.rowCount ? "deleted" : "not_found";
}
