import { describe, expect, it } from "vitest";
import { renderAnalyticsDashboard } from "./analytics-dashboard-renderer";
import type { AnalyticsDashboardPresentation } from "./analytics-dashboard-presenter";

const base: AnalyticsDashboardPresentation = {
  headline: "Conversation intelligence",
  attentionSummary: "2 conversations need your attention.",
  generatedAt: "2026-09-17T00:00:00.000Z",
  operational: [{ key: "active", label: "Active conversations", value: 3, attention: false }],
  topics: {
    title: "What comes up most",
    emptyMessage: "No topics yet.",
    items: [{ topic: "Travel", conversationCount: 4, messageCount: 12 }]
  },
  suggestions: {
    title: "What should I tell TNND about myself?",
    emptyMessage: "No gaps.",
    items: [{ topic: "Travel", title: "Add a travel story", detail: "Travel comes up often.", priority: "high" }]
  }
};

describe("renderAnalyticsDashboard", () => {
  it("renders operational, topic and content-gap data", () => {
    const html = renderAnalyticsDashboard(base);
    expect(html).toContain("Active conversations");
    expect(html).toContain("Travel");
    expect(html).toContain("Add a travel story");
    expect(html).toContain('data-priority="high"');
  });

  it("renders empty states and escapes dynamic text", () => {
    const html = renderAnalyticsDashboard({
      ...base,
      headline: "<unsafe>",
      topics: { ...base.topics, items: [] },
      suggestions: { ...base.suggestions, items: [] }
    });
    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).toContain("No topics yet.");
    expect(html).toContain("No gaps.");
    expect(html).not.toContain("<unsafe>");
  });
});