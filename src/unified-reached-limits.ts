import { verifiedDailyQuota, type DailyQuotaEvidence } from "./unified-quota-status.ts";
import { validSmartSwipeProgress } from "./tinder-smart-swipe-progress-store.ts";

/** Counts are purely informational. Never infer actual Tinder Like acceptance
 * from a claim. Unknown, stale or malformed counters are NOT zero.
 */
export type ReachedUnifiedLimit = {
  id: "swipe-attempts" | "swipe-sessions";
  label: string;
  used: number;
  max: number;
  dayKey: string;
};
export type UnifiedLimitSnapshot = {
  reached: ReachedUnifiedLimit[];
  swipeQuota: DailyQuotaEvidence | null;
  /** No unknown Like remains locally or in the durable server journal. */
  safeToReleaseSwipe: boolean;
};

export function reachedUnifiedLimits(
  settings: { maxRightSwipesPerDay: number; sessionsPerDay: number; timeZone: string },
  serverSummary: unknown,
  localProgress: unknown,
  nowMs: number
): UnifiedLimitSnapshot {
  const quota = verifiedDailyQuota(settings, serverSummary, nowMs);
  const reached: ReachedUnifiedLimit[] = [];
  if (!quota) return { reached, swipeQuota: null, safeToReleaseSwipe: false };
  if (quota.reached) {
    reached.push({
      id: "swipe-attempts",
      label: "Tentatives de Like (TNND)",
      used: quota.used,
      max: quota.limit,
      dayKey: quota.dayKey
    });
  }
  // Browser session quota is separate from server Like claims. Only a valid
  // same-day local progress record can prove that limit is reached.
  if (Number.isSafeInteger(settings.sessionsPerDay) && settings.sessionsPerDay > 0 &&
      validSmartSwipeProgress(localProgress) &&
      localProgress.dayKey === quota.dayKey &&
      localProgress.startedSessions >= settings.sessionsPerDay) {
    reached.push({
      id: "swipe-sessions",
      label: "Sessions Auto Swipe",
      used: localProgress.startedSessions,
      max: settings.sessionsPerDay,
      dayKey: quota.dayKey
    });
  }
  const server = serverSummary as { unresolvedAttempts?: unknown };
  const safeToReleaseSwipe = quota.reached &&
    Number.isSafeInteger(server.unresolvedAttempts) &&
    server.unresolvedAttempts === 0 &&
    validSmartSwipeProgress(localProgress) &&
    localProgress.dayKey === quota.dayKey &&
    localProgress.rightSwipesReserved === 0;
  return { reached, swipeQuota: quota, safeToReleaseSwipe };
}
