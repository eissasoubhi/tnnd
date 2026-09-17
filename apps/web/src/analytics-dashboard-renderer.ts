import type { AnalyticsDashboardPresentation } from "./analytics-dashboard-presenter";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderAnalyticsDashboard(presentation: AnalyticsDashboardPresentation): string {
  const operational = presentation.operational
    .map((metric) => `<article class="metric"><span>${escapeHtml(metric.label)}</span><strong>${metric.value}</strong></article>`)
    .join("");

  const topics = presentation.topics.items.length
    ? `<ul>${presentation.topics.items.map((item) => `<li><strong>${escapeHtml(item.topic)}</strong><span>${item.conversationCount} conversations · ${item.messageCount} messages</span></li>`).join("")}</ul>`
    : `<p class="subtle">${escapeHtml(presentation.topics.emptyMessage)}</p>`;

  const suggestions = presentation.suggestions.items.length
    ? `<ul>${presentation.suggestions.items.map((item) => `<li data-priority="${item.priority}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`).join("")}</ul>`
    : `<p class="subtle">${escapeHtml(presentation.suggestions.emptyMessage)}</p>`;

  return `
    <section class="analytics-dashboard" aria-label="Conversation intelligence">
      <div class="panel-heading">
        <div><p class="eyebrow">Analytics</p><h2>${escapeHtml(presentation.headline)}</h2></div>
        <span class="pill">${escapeHtml(presentation.attentionSummary)}</span>
      </div>
      <div class="metrics">${operational}</div>
      <section><h3>${escapeHtml(presentation.topics.title)}</h3>${topics}</section>
      <section><h3>${escapeHtml(presentation.suggestions.title)}</h3>${suggestions}</section>
    </section>
  `;
}
