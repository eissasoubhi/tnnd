export interface DatabaseConfig {
  url: string;
  ssl: boolean;
  maxConnections: number;
}

export const migrationFiles = ["0001_platform.sql"] as const;

export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://.");
  }

  const maxConnections = Number(env.DB_MAX_CONNECTIONS ?? 10);
  if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 100) {
    throw new Error("DB_MAX_CONNECTIONS must be an integer between 1 and 100.");
  }

  return {
    url,
    ssl: env.DB_SSL === "true",
    maxConnections
  };
}
