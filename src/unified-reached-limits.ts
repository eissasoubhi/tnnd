import { verifiedDailyQuota, type DailyQuotaEvidence } from "./unified-quota-status.ts";
import { tinderAccountDayKey } from "./tinder-smart-auto-swipe-policy.ts";
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
export type UnifiedDailyCounter = {
  id: ReachedUnifiedLimit["id"];
  label: string;
  used: number | null;
  max: number | null;
  dayKey: string | null;
  reached: boolean;
};
export type UnifiedLimitSnapshot = {
  counters: UnifiedDailyCounter[];
  reached: ReachedUnifiedLimit[];
  swipeQuota: DailyQuotaEvidence | null;
  /** Exhausted Swipe can hand off only after local and server claims are settled. */
  safeToReleaseSwipe: boolean;
};

export function reachedUnifiedLimits(
  settings: { maxRightSwipesPerDay: number | null; sessionsPerDay: number; timeZone: string },
  serverSummary: unknown,
  localProgress: unknown,
  nowMs: number
): UnifiedLimitSnapshot {
  const quota = verifiedDailyQuota(settings, serverSummary, nowMs);
  const reached: ReachedUnifiedLimit[] = [];
  let dayKey: string | null = null;
  try { dayKey = tinderAccountDayKey(nowMs, settings.timeZone); }
  catch { /* Invalid timezone means missing evidence, not zero. */ }
  const positive = (value: number | null): number | null =>
    value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
  const validLocal = dayKey !== null && validSmartSwipeProgress(localProgress) &&
    localProgress.dayKey === dayKey;
  const usedSessions = validLocal ? localProgress.startedSessions : null;
  // The former sessions-per-day limit is now a legacy preference only.
  // Sessions are a read-only counter, never a reason to pause Swipe.
  const maxSessions: number | null = null;
  const counters: UnifiedDailyCounter[] = [
    { id: "swipe-attempts", label: "Tentatives de Like (TNND)",
      used: quota?.used ?? null, max: positive(settings.maxRightSwipesPerDay),
      dayKey: quota?.dayKey ?? null, reached: quota?.reached === true },
    { id: "swipe-sessions", label: "Sessions Auto Swipe",
      used: usedSessions, max: maxSessions, dayKey: validLocal ? dayKey : null,
      reached: usedSessions !== null && maxSessions !== null && usedSessions >= maxSessions }
  ];
  if (!quota) return { reached, counters, swipeQuota: null, safeToReleaseSwipe: false };
  if (quota.reached && quota.limit !== null) {
    reached.push({
      id: "swipe-attempts",
      label: "Tentatives de Like (TNND)",
      used: quota.used,
      max: quota.limit,
      dayKey: quota.dayKey
    });
  }
  // No app-defined Swipe session limit or automatic session-cap handoff.
  const server = serverSummary as { unresolvedAttempts?: unknown };
  const safeToReleaseSwipe = quota.reached &&
    Number.isSafeInteger(server.unresolvedAttempts) &&
    server.unresolvedAttempts === 0 &&
    validSmartSwipeProgress(localProgress) &&
    localProgress.dayKey === quota.dayKey &&
    localProgress.rightSwipesReserved === 0;
  return { reached, counters, swipeQuota: quota, safeToReleaseSwipe };
}
