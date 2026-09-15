import { randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";

export interface AnalyzedTopic {
  topic: string;
  subtopic?: string;
  confidence: number;
  messageCount?: number;
}

export interface ConversationTopicState {
  primaryTopic?: AnalyzedTopic;
  secondaryTopics: AnalyzedTopic[];
  recentTopics: AnalyzedTopic[];
}

function normalizedTopic(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

export async function recordConversationTopics(
  conversationId: string,
  topics: AnalyzedTopic[],
  discussedAt: Date = new Date()
): Promise<void> {
  const normalized = topics
    .map((topic) => ({
      topic: normalizedTopic(topic.topic),
      subtopic: topic.subtopic ? normalizedTopic(topic.subtopic) : undefined,
      confidence: Math.max(0, Math.min(1, topic.confidence)),
      messageCount: Math.max(1, topic.messageCount ?? 1)
    }))
    .filter((topic) => topic.topic);
  if (!normalized.length) return;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query<{ topic: string }>(
      "SELECT topic FROM conversation_topics WHERE conversation_id = $1 AND is_current = true ORDER BY confidence DESC, last_discussed_at DESC LIMIT 1",
      [conversationId]
    );
    await client.query("UPDATE conversation_topics SET is_current = false WHERE conversation_id = $1", [conversationId]);
    for (let index = 0; index < normalized.length; index += 1) {
      const topic = normalized[index];
      await client.query(
        `INSERT INTO conversation_topics
           (conversation_id, topic, subtopic, confidence, message_count, first_discussed_at, last_discussed_at, is_current)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
         ON CONFLICT (conversation_id, topic, subtopic) DO UPDATE
         SET confidence = EXCLUDED.confidence,
             message_count = conversation_topics.message_count + EXCLUDED.message_count,
             last_discussed_at = EXCLUDED.last_discussed_at,
             is_current = EXCLUDED.is_current,
             updated_at = now()`,
        [conversationId, topic.topic, topic.subtopic ?? "", topic.confidence, topic.messageCount, discussedAt, index === 0]
      );
    }
    const previousTopic = previous.rows[0]?.topic;
    if (previousTopic && previousTopic !== normalized[0].topic) {
      await client.query(
        `INSERT INTO conversation_topic_transitions (id, conversation_id, from_topic, to_topic, transitioned_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), conversationId, previousTopic, normalized[0].topic, discussedAt]
      );
    }
    await client.query(
      "UPDATE conversations SET current_topic = $1, updated_at = now() WHERE id = $2",
      [normalized[0].topic, conversationId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getConversationTopicState(conversationId: string): Promise<ConversationTopicState> {
  const result = await getPool().query<{
    topic: string;
    subtopic: string;
    confidence: number;
    message_count: number;
    is_current: boolean;
  }>(
    `SELECT topic, subtopic, confidence, message_count, is_current
     FROM conversation_topics
     WHERE conversation_id = $1
     ORDER BY is_current DESC, last_discussed_at DESC, confidence DESC
     LIMIT 20`,
    [conversationId]
  );
  const mapped = result.rows.map((row) => ({
    topic: row.topic,
    ...(row.subtopic ? { subtopic: row.subtopic } : {}),
    confidence: Number(row.confidence),
    messageCount: row.message_count
  }));
  return {
    ...(mapped[0] && result.rows[0]?.is_current ? { primaryTopic: mapped[0] } : {}),
    secondaryTopics: mapped.slice(result.rows[0]?.is_current ? 1 : 0, 6),
    recentTopics: mapped.slice(0, 10)
  };
}
