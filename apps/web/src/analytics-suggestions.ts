import { analyticsContentGaps, type AnalyticsSnapshot, type MemoryCoverageRow } from "./analytics-client";

export interface AnalyticsSuggestion {
  topic: string;
  priority: "high" | "medium";
  title: string;
  detail: string;
}

function priorityFor(row: MemoryCoverageRow): AnalyticsSuggestion["priority"] {
  return row.gap === "none" && (row.conversationCount >= 3 || row.messageCount >= 10) ? "high" : "medium";
}

export function buildAnalyticsSuggestions(snapshot: AnalyticsSnapshot, limit = 5): AnalyticsSuggestion[] {
  const safeLimit = Math.max(0, Math.min(20, Math.trunc(limit)));
  return analyticsContentGaps(snapshot).slice(0, safeLimit).map((row) => {
    const storyCount = row.approvedMemoryCount;
    const title = storyCount === 0
      ? `Tell TNND something about ${row.topic}`
      : `Add another ${row.topic} story`;
    const detail = storyCount === 0
      ? `${row.topic} appears in ${row.conversationCount} conversation${row.conversationCount === 1 ? "" : "s"} and ${row.messageCount} messages, but no approved personal memory covers it yet.`
      : `${row.topic} appears in ${row.conversationCount} conversation${row.conversationCount === 1 ? "" : "s"}, while only ${storyCount} approved ${storyCount === 1 ? "memory is" : "memories are"} available.`;
    return { topic: row.topic, priority: priorityFor(row), title, detail };
  });
}
