import { mountAnalyticsDashboard } from "./analytics-dashboard-mount";

const panelId = "analytics-dashboard-panel";
const refreshButtonId = "analytics-dashboard-refresh";

function ensureAnalyticsPanel(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>(`#${panelId}`);
  if (existing) return existing;

  const grid = document.querySelector<HTMLElement>("#app .grid");
  if (!grid) return null;

  const panel = document.createElement("article");
  panel.className = "panel panel-wide workspace-feature";
  panel.id = "analytics-panel";
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Analytics</p>
        <h2>Conversation & memory insights</h2>
      </div>
      <button id="${refreshButtonId}" type="button" class="secondary">Refresh insights</button>
    </div>
    <p class="subtle">Understand conversation activity and memory usage without exposing private conversation content.</p>
    <p class="subtle" id="analytics-refresh-status" role="status" aria-live="polite"></p>
    <div id="${panelId}"></div>
  `;
  grid.append(panel);
  return panel.querySelector<HTMLElement>(`#${panelId}`);
}

async function refreshAnalytics(): Promise<void> {
  const container = ensureAnalyticsPanel();
  if (!container) return;

  const refreshButton = document.querySelector<HTMLButtonElement>(`#${refreshButtonId}`);
  if (refreshButton) refreshButton.disabled = true;
  const status = document.querySelector<HTMLElement>("#analytics-refresh-status");
  if (status) status.textContent = "Refreshing insights…";
  try {
    await mountAnalyticsDashboard(container);
    if (status) status.textContent = "Insights are up to date.";
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : "Unable to load insights. Try refreshing.";
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

void refreshAnalytics();
window.addEventListener("tnnd:auth-session-changed", () => void refreshAnalytics());
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.id === refreshButtonId) void refreshAnalytics();
});
