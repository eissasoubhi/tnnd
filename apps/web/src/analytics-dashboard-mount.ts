import { readSession } from "./auth-client";
import { loadAnalyticsDashboard } from "./analytics-dashboard-loader";
import { renderAnalyticsDashboard } from "./analytics-dashboard-renderer";

export interface AnalyticsDashboardMountResult {
  mounted: boolean;
  reason?: "missing-session" | "load-failed";
}

/**
 * Mounts the Phase 8 analytics experience into an existing page container.
 * Authentication and loading stay outside the renderer so the UI can expose
 * deterministic signed-out, loading and failure states.
 */
export async function mountAnalyticsDashboard(container: HTMLElement): Promise<AnalyticsDashboardMountResult> {
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
    container.innerHTML = renderAnalyticsDashboard(presentation);
    container.dataset.analyticsLoadedAt = loadedAt;
    return { mounted: true };
  } catch (error) {
    container.innerHTML = '<p class="subtle" role="status">Analytics are temporarily unavailable.</p>';
    console.error("Unable to load TNND analytics", error);
    return { mounted: false, reason: "load-failed" };
  } finally {
    container.removeAttribute("aria-busy");
  }
}
