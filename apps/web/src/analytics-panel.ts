import { mountAnalyticsDashboard } from "./analytics-dashboard-mount";

const panelId = "analytics-dashboard-panel";

function ensureAnalyticsPanel(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>(`#${panelId}`);
  if (existing) return existing;

  const grid = document.querySelector<HTMLElement>("#app .grid");
  if (!grid) return null;

  const panel = document.createElement("article");
  panel.className = "panel panel-wide";
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Analytics</p>
        <h2>Conversation & memory insights</h2>
      </div>
    </div>
    <div id="${panelId}"></div>
  `;
  grid.append(panel);
  return panel.querySelector<HTMLElement>(`#${panelId}`);
}

async function refreshAnalytics(): Promise<void> {
  const container = ensureAnalyticsPanel();
  if (container) await mountAnalyticsDashboard(container);
}

void refreshAnalytics();
window.addEventListener("tnnd:auth-session-changed", () => void refreshAnalytics());
