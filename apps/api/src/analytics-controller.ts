import { getAnalyticsSnapshot, type AnalyticsSnapshot } from "./analytics-service.js";

export interface AnalyticsControllerResult {
  status: number;
  body: AnalyticsSnapshot | { error: string };
}

export type AnalyticsSnapshotLoader = (userId: string) => Promise<AnalyticsSnapshot>;

export async function handleAnalyticsRequest(
  userId: string,
  loadSnapshot: AnalyticsSnapshotLoader = getAnalyticsSnapshot
): Promise<AnalyticsControllerResult> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return { status: 401, body: { error: "invalid_or_expired_session" } };
  }

  try {
    return { status: 200, body: await loadSnapshot(normalizedUserId) };
  } catch (error) {
    console.error("Unable to load TNND analytics", error);
    return { status: 500, body: { error: "analytics_unavailable" } };
  }
}
