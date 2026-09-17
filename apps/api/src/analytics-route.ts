import { handleAnalyticsRequest, type AnalyticsControllerResult, type AnalyticsSnapshotLoader } from "./analytics-controller.js";

export const analyticsRoutePath = "/api/v1/analytics";
export const analyticsCapability = "analytics";

export interface AnalyticsRouteSession {
  user: { id: string };
}

export type AnalyticsRouteAuthenticator = () => Promise<AnalyticsRouteSession | null>;

export function isAnalyticsRoute(method: string | undefined, pathname: string): boolean {
  return method === "GET" && pathname === analyticsRoutePath;
}

export async function handleAuthenticatedAnalyticsRoute(
  authenticate: AnalyticsRouteAuthenticator,
  loadSnapshot?: AnalyticsSnapshotLoader
): Promise<AnalyticsControllerResult> {
  const session = await authenticate();
  if (!session) {
    return { status: 401, body: { error: "invalid_or_expired_session" } };
  }

  return handleAnalyticsRequest(session.user.id, loadSnapshot);
}

export async function dispatchAnalyticsRoute(
  method: string | undefined,
  pathname: string,
  authenticate: AnalyticsRouteAuthenticator,
  loadSnapshot?: AnalyticsSnapshotLoader
): Promise<AnalyticsControllerResult | null> {
  if (!isAnalyticsRoute(method, pathname)) return null;
  return handleAuthenticatedAnalyticsRoute(authenticate, loadSnapshot);
}
