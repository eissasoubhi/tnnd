import type { SmartSwipeDailyProgress } from "./tinder-smart-auto-swipe-policy";

/** The backend counts every attempted Like, including unknown outcomes.
 * A reviewed UNKNOWN can release only the matching local reservation, without
 * incrementing rightSwipesConfirmed or crediting the user's daily quota.
 */
export interface DayReconciliationProof {
  dayKey: string;
  attempts: number;
  uiObserved: number;
  reviewedUnknown: number;
  unresolvedAcrossDays: number;
}
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function parseDayReconciliationProof(
  data: unknown, expectedDay: string
): DayReconciliationProof | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = data as Record<string, unknown>;
  if (v.dayKey !== expectedDay || !integer(v.attempts) ||
      !integer(v.uiObserved) || !integer(v.reviewedUnknown) ||
      !integer(v.unresolvedAcrossDays) ||
      v.uiObserved + v.reviewedUnknown > v.attempts) return null;
  return {
    dayKey: expectedDay, attempts: v.attempts,
    uiObserved: v.uiObserved, reviewedUnknown: v.reviewedUnknown,
    unresolvedAcrossDays: v.unresolvedAcrossDays
  };
}

export type LocalReconciliationResult =
  | { ok: true; changed: boolean; progress: SmartSwipeDailyProgress }
  | { ok: false; reason: "server_attempt_unresolved" | "reservation_mismatch" };

export function reconcileReviewedLocalSwipeAttempt(
  progress: SmartSwipeDailyProgress, proof: DayReconciliationProof
): LocalReconciliationResult {
  if (proof.unresolvedAcrossDays !== 0) {
    return { ok: false, reason: "server_attempt_unresolved" };
  }
  if (progress.rightSwipesReserved === 0) {
    return { ok: true, changed: false, progress };
  }
  // The pre-existing one-card reservation has no stored ID. Refuse
  // ambiguous cross-device/multi-review counts; never silently erase it.
  if (progress.dayKey !== proof.dayKey ||
      progress.rightSwipesReserved !== 1 ||
      proof.reviewedUnknown !== 1 ||
      proof.uiObserved !== progress.rightSwipesConfirmed ||
      proof.attempts !== progress.rightSwipesConfirmed + 1) {
    return { ok: false, reason: "reservation_mismatch" };
  }
  return {
    ok: true, changed: true,
    progress: { ...progress, rightSwipesReserved: 0 }
  };
}
