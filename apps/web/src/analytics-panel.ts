import { mountAnalyticsDashboard } from "./analytics-dashboard-mount";
import { readSession } from "./auth-client";

const panelId = "analytics-dashboard-panel";
const refreshButtonId = "analytics-dashboard-refresh";
let latestRefresh = 0;

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
  const requestId = ++latestRefresh;
  const sessionToken = readSession()?.token ?? null;

  const refreshButton = document.querySelector<HTMLButtonElement>(`#${refreshButtonId}`);
  if (refreshButton) refreshButton.disabled = true;
  const status = document.querySelector<HTMLElement>("#analytics-refresh-status");
  if (status) status.textContent = "Refreshing insights…";
  try {
    const result = await mountAnalyticsDashboard(container);
    if (requestId !== latestRefresh || readSession()?.token !== sessionToken) return;
    if (result.reason === "stale-request") return;
    if (status) status.textContent = result.mounted ? "Insights updated from the latest available snapshot." : result.reason === "missing-session" ? "Sign in to see analytics." : "Could not load analytics. Check the API connection and retry.";
  } catch (error) {
    if (requestId === latestRefresh && readSession()?.token === sessionToken && status) status.textContent = "Unable to load insights. Try refreshing.";
  } finally {
    if (requestId === latestRefresh && refreshButton) refreshButton.disabled = false;
  }
}

void refreshAnalytics();
window.addEventListener("tnnd:auth-session-changed", () => void refreshAnalytics());
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.id === refreshButtonId) void refreshAnalytics();
});
