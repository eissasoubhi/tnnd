import { readSession } from "./auth-client";
import { loadAnalyticsDashboard } from "./analytics-dashboard-loader";
import { renderAnalyticsDashboard } from "./analytics-dashboard-renderer";
import { isLatestSessionResponse } from "./workspace-request-guard";

export interface AnalyticsDashboardMountResult {
  mounted: boolean;
  reason?: "missing-session" | "load-failed" | "stale-request";
}

/**
 * Mounts the Phase 8 analytics experience into an existing page container.
 * Authentication and loading stay outside the renderer so the UI can expose
 * deterministic signed-out, loading and failure states.
 */
const analyticsRequests = new WeakMap<HTMLElement, number>();

export async function mountAnalyticsDashboard(container: HTMLElement): Promise<AnalyticsDashboardMountResult> {
  const requestId = (analyticsRequests.get(container) ?? 0) + 1;
  analyticsRequests.set(container, requestId);
  const session = readSession();
  if (!session) {
    delete container.dataset.analyticsLoadedAt;
    container.innerHTML = '<p class="subtle">Sign in to load conversation analytics.</p>';
    return { mounted: false, reason: "missing-session" };
  }

  delete container.dataset.analyticsLoadedAt;
  container.setAttribute("aria-busy", "true");
  container.innerHTML = '<p class="subtle">Loading conversation analytics…</p>';

  try {
    const { presentation, loadedAt } = await loadAnalyticsDashboard(session);
    if (!isLatestSessionResponse(requestId, analyticsRequests.get(container) ?? 0, session.token, readSession()?.token)) {
      return { mounted: false, reason: "stale-request" };
    }
    container.innerHTML = renderAnalyticsDashboard(presentation);
    container.dataset.analyticsLoadedAt = loadedAt;
    return { mounted: true };
  } catch (error) {
    if (!isLatestSessionResponse(requestId, analyticsRequests.get(container) ?? 0, session.token, readSession()?.token)) {
      return { mounted: false, reason: "stale-request" };
    }
    container.innerHTML = '<p class="subtle" role="alert">Analytics are temporarily unavailable. Retry when the API is available.</p>';
    console.error("Unable to load TNND analytics", error);
    return { mounted: false, reason: "load-failed" };
  } finally {
    if (analyticsRequests.get(container) === requestId) container.removeAttribute("aria-busy");
  }
}
