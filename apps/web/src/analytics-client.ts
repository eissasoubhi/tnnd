import type { AuthSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
const analyticsRequestTimeoutMs = 10_000;

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

interface AnalyticsErrorPayload {
  error?: string;
}

function isAnalyticsError(payload: unknown): payload is AnalyticsErrorPayload {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

function isAnalyticsSnapshot(payload: unknown): payload is AnalyticsSnapshot {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Partial<AnalyticsSnapshot>;
  return typeof candidate.generatedAt === "string"
    && typeof candidate.operational === "object"
    && candidate.operational !== null
    && Array.isArray(candidate.topics)
    && Array.isArray(candidate.memoryCoverage);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function loadAnalytics(session: AuthSession): Promise<AnalyticsSnapshot> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), analyticsRequestTimeoutMs);

  try {
    const response = await fetch(`${apiBase}/api/v1/analytics`, {
      headers: { authorization: `Bearer ${session.token}` },
      signal: controller.signal
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      throw new Error("Unable to load analytics.");
    }
    if (isAnalyticsError(payload)) {
      throw new Error(payload.error ?? "Unable to load analytics.");
    }
    if (!isAnalyticsSnapshot(payload)) {
      throw new Error("Analytics response is invalid.");
    }
    return payload;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Analytics request timed out.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function analyticsContentGaps(snapshot: AnalyticsSnapshot): MemoryCoverageRow[] {
  return snapshot.memoryCoverage
    .filter((row) => row.gap !== "covered")
    .sort((left, right) => right.messageCount - left.messageCount || right.conversationCount - left.conversationCount);
}
