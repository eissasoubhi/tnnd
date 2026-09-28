import { readFile } from "node:fs/promises";
import { getPool } from "./db-client.js";
import { migrationFiles } from "./database.js";

export type MigrationQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
};

export type MigrationQuery = (
  text: string,
  values?: unknown[]
) => Promise<MigrationQueryResult>;

export type MigrationReader = (file: string) => Promise<string>;

export type MigrationRunOptions = {
  files?: readonly string[];
  readMigration?: MigrationReader;
};

const migrationsRoot = new URL("../migrations/", import.meta.url);

async function defaultReadMigration(file: string): Promise<string> {
  return readFile(new URL(file, migrationsRoot), "utf8");
}

export function migrationVersion(file: string): string {
  return file.replace(/\.sql$/i, "");
}

export function stripOuterTransaction(sql: string): string {
  const trimmed = sql.trim();
  if (!/^BEGIN;\s*/i.test(trimmed) || !/\s*COMMIT;$/i.test(trimmed)) return trimmed;
  return trimmed
    .replace(/^BEGIN;\s*/i, "")
    .replace(/\s*COMMIT;$/i, "")
    .trim();
}

export async function runPendingMigrations(
  query: MigrationQuery,
  options: MigrationRunOptions = {}
): Promise<string[]> {
  const files = options.files ?? migrationFiles;
  const readMigration = options.readMigration ?? defaultReadMigration;

  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const appliedResult = await query("SELECT version FROM schema_migrations ORDER BY version ASC");
  const applied = new Set(
    appliedResult.rows
      .map((row) => typeof row.version === "string" ? row.version : "")
      .filter(Boolean)
  );

  const newlyApplied: string[] = [];
  for (const file of files) {
    const version = migrationVersion(file);
    if (applied.has(version)) continue;

    const sql = stripOuterTransaction(await readMigration(file));
    await query("BEGIN");
    try {
      if (sql) await query(sql);
      await query(
        "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
        [version]
      );
      await query("COMMIT");
      newlyApplied.push(version);
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  }

  return newlyApplied;
}

export async function migrateDatabase(): Promise<string[]> {
  const client = await getPool().connect();
  try {
    return runPendingMigrations(
      async (text, values) => {
        const result = await client.query(text, values);
        return {
          rows: result.rows as Array<Record<string, unknown>>,
          rowCount: result.rowCount
        };
      }
    );
  } finally {
    client.release();
  }
}
