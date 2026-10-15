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
  const primaryKeys = new Set(["waitingForUser", "actionRequired", "active", "paused"]);
  const renderMetric = (metric: (typeof presentation.operational)[number]): string =>
    `<article class="analytics-status-metric"><span>${escapeHtml(metric.label)}</span><strong>${metric.value}</strong></article>`;
  const primary = presentation.operational.filter(metric => primaryKeys.has(metric.key)).map(renderMetric).join("");
  const advanced = presentation.operational.filter(metric => !primaryKeys.has(metric.key)).map(renderMetric).join("");

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
      <p class="subtle analytics-snapshot">Last verified snapshot: <time datetime="${escapeHtml(presentation.generatedAt)}">${escapeHtml(presentation.generatedAt)}</time>. These are stored counts, not live Tinder activity.</p>
      <section class="analytics-insight-group" aria-label="Key conversation status counts">
        <h3>At a glance</h3>
        <div class="analytics-status-grid">${primary}</div>
      </section>
      <details class="analytics-advanced-status">
        <summary>View the other conversation statuses</summary>
        <div class="analytics-status-grid">${advanced}</div>
      </details>
      <section class="analytics-insight-group"><h3>${escapeHtml(presentation.topics.title)}</h3>${topics}</section>
      <section class="analytics-insight-group"><h3>${escapeHtml(presentation.suggestions.title)}</h3>${suggestions}</section>
    </section>
  `;
}
