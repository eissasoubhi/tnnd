import type { AuthSession } from "./auth-client";
import { loadAnalytics } from "./analytics-client";
import { buildAnalyticsDashboardModel } from "./analytics-dashboard-model";
import { presentAnalyticsDashboard, type AnalyticsDashboardPresentation } from "./analytics-dashboard-presenter";

export interface AnalyticsDashboardLoadResult {
  presentation: AnalyticsDashboardPresentation;
  loadedAt: string;
}

/**
 * Loads the authenticated analytics snapshot and turns it into the final
 * dashboard presentation consumed by UI components.
 *
 * Keeping the orchestration here makes the eventual page/component thin and
 * gives us one boundary to add refresh/error state without duplicating the
 * analytics transformation pipeline.
 */
export async function loadAnalyticsDashboard(session: AuthSession): Promise<AnalyticsDashboardLoadResult> {
  const snapshot = await loadAnalytics(session);
  const model = buildAnalyticsDashboardModel(snapshot);

  return {
    presentation: presentAnalyticsDashboard(model),
    loadedAt: new Date().toISOString()
  };
}
