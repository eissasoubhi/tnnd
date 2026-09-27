import { getPool } from "./db-client.js";

export interface AccountDataExport {
  exportedAt: string;
  account: unknown;
  profile: unknown;
  aiProvider: unknown;
  textingStyleSourceExamples: unknown;
  conversations: unknown[];
  messages: unknown[];
  humanActions: unknown[];
  matchProfiles: unknown[];
  personalMemories: unknown[];
  conversationTopics: unknown[];
  conversationTopicTransitions: unknown[];
}

export type AccountExportQuery = <T = Record<string, unknown>>(
  text: string,
  values: unknown[]
) => Promise<{ rows: T[] }>;

function defaultQuery<T = Record<string, unknown>>(text: string, values: unknown[]) {
  return getPool().query<T>(text, values);
}

/**
 * Builds a portable user-scoped export without provider secrets, password hashes,
 * session tokens or extension auth material.
 */
export async function buildAccountDataExport(
  userId: string,
  query: AccountExportQuery = defaultQuery
): Promise<AccountDataExport | null> {
  const id = userId.trim();
  if (!id) return null;

  const [
    account,
    profile,
    aiProvider,
    textingStyleSourceExamples,
    conversations,
    messages,
    humanActions,
    matchProfiles,
    personalMemories,
    conversationTopics,
    conversationTopicTransitions
  ] = await Promise.all([
    query("SELECT id, email, created_at, updated_at FROM users WHERE id = $1 LIMIT 1", [id]),
    query("SELECT schema_version, profile_json, created_at, updated_at FROM user_profiles WHERE user_id = $1 LIMIT 1", [id]),
    query("SELECT provider, model, created_at, updated_at FROM ai_provider_settings WHERE user_id = $1 LIMIT 1", [id]),
    query("SELECT examples, created_at, updated_at FROM texting_style_source_examples WHERE user_id = $1 LIMIT 1", [id]),
    query("SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at ASC", [id]),
    query(
      `SELECT m.*
       FROM conversation_messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1
       ORDER BY m.sent_at ASC, m.created_at ASC`,
      [id]
    ),
    query("SELECT * FROM human_actions WHERE user_id = $1 ORDER BY created_at ASC", [id]),
    query("SELECT * FROM match_profiles WHERE user_id = $1 ORDER BY captured_at ASC", [id]),
    query("SELECT * FROM personal_memories WHERE user_id = $1 ORDER BY created_at ASC", [id]),
    query(
      `SELECT t.*
       FROM conversation_topics t
       JOIN conversations c ON c.id = t.conversation_id
       WHERE c.user_id = $1
       ORDER BY t.first_discussed_at ASC`,
      [id]
    ),
    query(
      `SELECT t.*
       FROM conversation_topic_transitions t
       JOIN conversations c ON c.id = t.conversation_id
       WHERE c.user_id = $1
       ORDER BY t.transitioned_at ASC`,
      [id]
    )
  ]);

  if (!account.rows[0]) return null;

  return {
    exportedAt: new Date().toISOString(),
    account: account.rows[0],
    profile: profile.rows[0] ?? null,
    aiProvider: aiProvider.rows[0] ?? null,
    textingStyleSourceExamples: textingStyleSourceExamples.rows[0] ?? null,
    conversations: conversations.rows,
    messages: messages.rows,
    humanActions: humanActions.rows,
    matchProfiles: matchProfiles.rows,
    personalMemories: personalMemories.rows,
    conversationTopics: conversationTopics.rows,
    conversationTopicTransitions: conversationTopicTransitions.rows
  };
}
