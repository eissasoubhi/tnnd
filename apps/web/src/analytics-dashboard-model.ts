import type { AnalyticsSnapshot, OperationalAnalytics, TopicAnalyticsRow } from "./analytics-client";
import { analyticsSuggestions, type AnalyticsSuggestion } from "./analytics-suggestions";

export interface OperationalMetric {
  key: keyof OperationalAnalytics;
  label: string;
  value: number;
  attention: boolean;
}

export interface AnalyticsDashboardModel {
  generatedAt: string;
  operational: OperationalMetric[];
  topTopics: TopicAnalyticsRow[];
  suggestions: AnalyticsSuggestion[];
  totalConversationsNeedingAttention: number;
}

const operationalLabels: Record<keyof OperationalAnalytics, string> = {
  active: "Active",
  waitingForThem: "Waiting for them",
  waitingForUser: "Waiting for you",
  actionRequired: "Action required",
  paused: "Paused",
  disabled: "Disabled",
  movedOffTinder: "Moved off Tinder",
  stale: "Stale",
  archived: "Archived"
};

const attentionKeys = new Set<keyof OperationalAnalytics>(["waitingForUser", "actionRequired", "stale"]);

export function buildAnalyticsDashboardModel(snapshot: AnalyticsSnapshot): AnalyticsDashboardModel {
  const operational = (Object.keys(operationalLabels) as Array<keyof OperationalAnalytics>).map((key) => ({
    key,
    label: operationalLabels[key],
    value: snapshot.operational[key],
    attention: attentionKeys.has(key) && snapshot.operational[key] > 0
  }));

  return {
    generatedAt: snapshot.generatedAt,
    operational,
    topTopics: [...snapshot.topics]
      .sort((left, right) => right.messageCount - left.messageCount || right.conversationCount - left.conversationCount)
      .slice(0, 5),
    suggestions: analyticsSuggestions(snapshot).slice(0, 5),
    totalConversationsNeedingAttention:
      snapshot.operational.waitingForUser + snapshot.operational.actionRequired + snapshot.operational.stale
  };
}
