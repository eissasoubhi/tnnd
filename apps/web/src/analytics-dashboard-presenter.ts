import type { AnalyticsDashboardModel, OperationalMetric } from "./analytics-dashboard-model";

export interface AnalyticsDashboardSection<T> {
  title: string;
  emptyMessage: string;
  items: T[];
}

export interface AnalyticsDashboardPresentation {
  headline: string;
  attentionSummary: string;
  generatedAt: string;
  operational: OperationalMetric[];
  topics: AnalyticsDashboardSection<{
    topic: string;
    conversationCount: number;
    messageCount: number;
  }>;
  suggestions: AnalyticsDashboardSection<{
    topic: string;
    title: string;
    detail: string;
    priority: "high" | "medium";
  }>;
}

export function presentAnalyticsDashboard(model: AnalyticsDashboardModel): AnalyticsDashboardPresentation {
  const attention = model.totalConversationsNeedingAttention;

  return {
    headline: "Conversation intelligence",
    attentionSummary: attention === 0
      ? "Nothing needs your attention right now."
      : `${attention} conversation${attention === 1 ? "" : "s"} need${attention === 1 ? "s" : ""} your attention.`,
    generatedAt: model.generatedAt,
    operational: model.operational,
    topics: {
      title: "What comes up most",
      emptyMessage: "Topics will appear after TNND has enough conversation history.",
      items: model.topTopics.map((topic) => ({
        topic: topic.topic,
        conversationCount: topic.conversationCount,
        messageCount: topic.messageCount
      }))
    },
    suggestions: {
      title: "What should I tell TNND about myself?",
      emptyMessage: "TNND has enough personal context for the topics it currently sees.",
      items: model.suggestions.map((suggestion) => ({
        topic: suggestion.topic,
        title: suggestion.title,
        detail: suggestion.detail,
        priority: suggestion.priority
      }))
    }
  };
}
