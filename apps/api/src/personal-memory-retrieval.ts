import { listPersonalMemories, type StoredPersonalMemory } from "./personal-memory-service.js";

export interface PersonalMemoryRetrievalQuery {
  topics?: readonly string[];
  limit?: number;
  now?: Date;
}

export interface RankedPersonalMemory {
  memory: StoredPersonalMemory;
  score: number;
  matchedTopics: string[];
}

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 8;
const REUSE_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 3;

function normalizeTopic(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeTopics(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.map(normalizeTopic).filter(Boolean))].slice(0, 20);
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1) throw new Error("invalid_personal_memory_retrieval_limit");
  return Math.min(value, MAX_LIMIT);
}

function reusePenalty(memory: StoredPersonalMemory, now: Date): number {
  if (!memory.lastUsedAt) return 0;
  const lastUsed = Date.parse(memory.lastUsedAt);
  if (!Number.isFinite(lastUsed)) return 0;
  const age = Math.max(0, now.getTime() - lastUsed);
  if (age >= REUSE_COOLDOWN_MS) return 0;
  return Math.round(70 * (1 - age / REUSE_COOLDOWN_MS));
}

export function rankPersonalMemories(
  memories: readonly StoredPersonalMemory[],
  query: PersonalMemoryRetrievalQuery = {}
): RankedPersonalMemory[] {
  const topics = normalizeTopics(query.topics);
  const topicSet = new Set(topics);
  const now = query.now ?? new Date();
  const limit = boundedLimit(query.limit);

  return memories
    .filter((memory) => memory.reviewStatus === "approved" && memory.structuredAnalysis.allowedForChat)
    .map((memory) => {
      const memoryTopics = normalizeTopics(memory.structuredAnalysis.topics);
      const matchedTopics = memoryTopics.filter((topic) => topicSet.has(topic));
      const relevance = topics.length === 0 ? 25 : matchedTopics.length * 100;
      const repetitionPenalty = Math.min(memory.usageCount * 4, 40) + reusePenalty(memory, now);
      return {
        memory,
        score: relevance - repetitionPenalty,
        matchedTopics
      };
    })
    .filter((candidate) => topics.length === 0 || candidate.matchedTopics.length > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.memory.usageCount !== right.memory.usageCount) return left.memory.usageCount - right.memory.usageCount;
      return left.memory.updatedAt.localeCompare(right.memory.updatedAt) * -1;
    })
    .slice(0, limit);
}

export async function retrievePersonalMemories(
  userId: string,
  query: PersonalMemoryRetrievalQuery = {}
): Promise<RankedPersonalMemory[]> {
  return rankPersonalMemories(await listPersonalMemories(userId), query);
}
