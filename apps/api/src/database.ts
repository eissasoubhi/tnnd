export interface DatabaseConfig {
  url: string;
  ssl: boolean;
  maxConnections: number;
}

export const migrationFiles = [
  "0001_platform.sql",
  "0002_auth_sessions.sql",
  "0003_human_actions.sql",
  "0004_conversations.sql",
  "0005_conversation_temporary_instructions.sql",
  "0006_conversation_overrides.sql",
  "0007_conversation_management_state.sql",
  "0008_conversation_sync_cursor.sql",
  "0009_match_profiles.sql",
  "0010_personal_memories.sql",
  "0011_conversation_topics.sql",
  "0012_conversation_summaries.sql",
  "0013_conversation_facts.sql",
  "0014_conversation_fact_analysis_state.sql",
  "0015_ai_provider_settings.sql",
  "0016_texting_style_source_examples.sql"
] as const;

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
