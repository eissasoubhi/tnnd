import { getPool } from "./db-client.js";
import { listPersonalMemories } from "./personal-memory-service.js";
import type { ConversationStatus } from "./conversation-sync-contract.js";

export interface OperationalAnalytics {
  active: number;
  waitingForThem: number;
  waitingForUser: number;
  actionRequired: number;
  paused: number;
  disabled: number;
  movedOffTinder: number;
  stale: number;
  archived: number;
}

export interface TopicAnalyticsRow {
  topic: string;
  conversationCount: number;
  messageCount: number;
  lastDiscussedAt: string;
}

export interface MemoryCoverageRow extends TopicAnalyticsRow {
  approvedMemoryCount: number;
  memoryUsageCount: number;
  coverageScore: number;
  gap: "none" | "low" | "covered";
}

export interface AnalyticsSnapshot {
  generatedAt: string;
  operational: OperationalAnalytics;
  topics: TopicAnalyticsRow[];
  memoryCoverage: MemoryCoverageRow[];
}

const statusKey: Record<ConversationStatus, keyof OperationalAnalytics> = {
  active: "active",
  paused: "paused",
  disabled: "disabled",
  "waiting-for-them": "waitingForThem",
  "waiting-for-user": "waitingForUser",
  "action-required": "actionRequired",
  "moved-off-tinder": "movedOffTinder",
  stale: "stale",
  archived: "archived"
};

function emptyOperational(): OperationalAnalytics {
  return {
    active: 0,
    waitingForThem: 0,
    waitingForUser: 0,
    actionRequired: 0,
    paused: 0,
    disabled: 0,
    movedOffTinder: 0,
    stale: 0,
    archived: 0
  };
}

function normalizeTopic(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function computeMemoryCoverage(
  topics: TopicAnalyticsRow[],
  memories: Awaited<ReturnType<typeof listPersonalMemories>>
): MemoryCoverageRow[] {
  const approved = memories.filter((memory) => memory.reviewStatus === "approved" && memory.structuredAnalysis.allowedForChat);
  const byTopic = new Map<string, { count: number; usage: number }>();
  for (const memory of approved) {
    for (const topic of new Set(memory.structuredAnalysis.topics.map(normalizeTopic).filter(Boolean))) {
      const current = byTopic.get(topic) ?? { count: 0, usage: 0 };
      current.count += 1;
      current.usage += memory.usageCount;
      byTopic.set(topic, current);
    }
  }
  return topics.map((topic) => {
    const memory = byTopic.get(normalizeTopic(topic.topic)) ?? { count: 0, usage: 0 };
    const coverageScore = Math.min(1, memory.count / Math.max(1, topic.conversationCount));
    const gap: MemoryCoverageRow["gap"] = memory.count === 0
      ? "none"
      : coverageScore < 0.5
        ? "low"
        : "covered";
    return {
      ...topic,
      approvedMemoryCount: memory.count,
      memoryUsageCount: memory.usage,
      coverageScore: Number(coverageScore.toFixed(3)),
      gap
    };
  });
}

async function loadOperational(userId: string): Promise<OperationalAnalytics> {
  const result = await getPool().query<{ status: ConversationStatus; count: string | number }>(
    `SELECT status, COUNT(*) AS count
     FROM conversations
     WHERE user_id = $1
     GROUP BY status`,
    [userId]
  );
  const operational = emptyOperational();
  for (const row of result.rows) {
    const key = statusKey[row.status];
    if (key) operational[key] = Number(row.count) || 0;
  }
  return operational;
}

async function loadTopics(userId: string): Promise<TopicAnalyticsRow[]> {
  const result = await getPool().query<{
    topic: string;
    conversation_count: string | number;
    message_count: string | number;
    last_discussed_at: Date;
  }>(
    `SELECT ct.topic,
            COUNT(DISTINCT ct.conversation_id) AS conversation_count,
            SUM(ct.message_count) AS message_count,
            MAX(ct.last_discussed_at) AS last_discussed_at
     FROM conversation_topics ct
     JOIN conversations c ON c.id = ct.conversation_id
     WHERE c.user_id = $1
     GROUP BY ct.topic
     ORDER BY SUM(ct.message_count) DESC, MAX(ct.last_discussed_at) DESC
     LIMIT 100`,
    [userId]
  );
  return result.rows.map((row) => ({
    topic: row.topic,
    conversationCount: Number(row.conversation_count) || 0,
    messageCount: Number(row.message_count) || 0,
    lastDiscussedAt: row.last_discussed_at.toISOString()
  }));
}

export async function getAnalyticsSnapshot(userId: string): Promise<AnalyticsSnapshot> {
  const [operational, topics, memories] = await Promise.all([
    loadOperational(userId),
    loadTopics(userId),
    listPersonalMemories(userId)
  ]);
  return {
    generatedAt: new Date().toISOString(),
    operational,
    topics,
    memoryCoverage: computeMemoryCoverage(topics, memories)
  };
}
