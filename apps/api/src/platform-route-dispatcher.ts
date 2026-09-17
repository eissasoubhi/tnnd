import { apiMeta } from "./api-meta.js";
import { dispatchAnalyticsRoute, type AnalyticsRouteAuthenticator } from "./analytics-route.js";
import type { AnalyticsSnapshotLoader } from "./analytics-controller.js";

export interface PlatformRouteResult {
  status: number;
  body: unknown;
}

export interface PlatformRouteDependencies {
  authenticate: AnalyticsRouteAuthenticator;
  loadAnalyticsSnapshot?: AnalyticsSnapshotLoader;
}

/**
 * Dispatches small platform-level GET routes before the legacy server router.
 * Keeping this isolated lets main.ts delegate new platform endpoints without
 * growing another large inline routing block.
 */
export async function dispatchPlatformRoute(
  method: string | undefined,
  pathname: string,
  dependencies: PlatformRouteDependencies
): Promise<PlatformRouteResult | null> {
  if (method === "GET" && pathname === "/api/v1/meta") {
    return { status: 200, body: apiMeta() };
  }

  return dispatchAnalyticsRoute(
    method,
    pathname,
    dependencies.authenticate,
    dependencies.loadAnalyticsSnapshot
  );
}
