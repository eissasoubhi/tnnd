import { handleAnalyticsRequest, type AnalyticsControllerResult, type AnalyticsSnapshotLoader } from "./analytics-controller.js";

export interface AnalyticsRouteSession {
  user: { id: string };
}

export type AnalyticsRouteAuthenticator = () => Promise<AnalyticsRouteSession | null>;

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
