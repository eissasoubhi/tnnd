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
  | { ok: false; reason:
      "server_attempt_unresolved" | "reservation_day_mismatch" |
      "reservation_count_mismatch" | "server_attempts_not_fully_resolved" |
      "local_observed_count_mismatch" | "local_attempt_count_exceeds_server" };

export function reconcileReviewedLocalSwipeAttempt(
  progress: SmartSwipeDailyProgress, proof: DayReconciliationProof
): LocalReconciliationResult {
  if (proof.unresolvedAcrossDays !== 0) {
    return { ok: false, reason: "server_attempt_unresolved" };
  }
  // A stop/service-worker crash between the durable server resolution and
  // the local Chrome storage write may leave the local UI-observed count ONE
  // behind PostgreSQL. That is not evidence of an extra Like: the server
  // already owns a UI transition record. Reconcile only the exact historical
  // one-observed/one-reviewed-UNKNOWN shape after a deliberate manual review.
  //
  // All historical attempt slots stay spent on the server. This changes only
  // the local bookkeeping and never repeats or confirms a Tinder Like.
  if (progress.rightSwipesReserved === 0) {
    return { ok: true, changed: false, progress };
  }
  if (progress.dayKey !== proof.dayKey)
    return { ok: false, reason: "reservation_day_mismatch" };
  if (progress.rightSwipesReserved !== 1 || proof.reviewedUnknown !== 1)
    return { ok: false, reason: "reservation_count_mismatch" };
  // Require a complete server picture: no other status/attempt can be
  // silently hidden or used to justify releasing the local reservation.
  if (proof.attempts !== proof.uiObserved + proof.reviewedUnknown)
    return { ok: false, reason: "server_attempts_not_fully_resolved" };
  // The only tolerated drift is precisely ONE UI-observed resolution that
  // the old worker failed to commit locally. Never decrease local counters.
  const observedDrift = proof.uiObserved - progress.rightSwipesConfirmed;
  if (observedDrift < 0 || observedDrift > 1)
    return { ok: false, reason: "local_observed_count_mismatch" };
  if (progress.rightSwipesConfirmed + progress.rightSwipesReserved > proof.attempts)
    return { ok: false, reason: "local_attempt_count_exceeds_server" };
  return {
    ok: true, changed: true,
    progress: {
      ...progress,
      rightSwipesConfirmed: proof.uiObserved, // UI-observed only; NOT Tinder server receipt
      rightSwipesReserved: 0
    }
  };
}

/** Only non-sensitive day/count fields for user's own diagnostics.
 * No profile data, device IDs, tokens or Tinder endpoints.
 */
export function publicSwipeReconciliationCounts(
  progress: SmartSwipeDailyProgress, proof: DayReconciliationProof
): string {
  return [
    "local day " + progress.dayKey,
    "local UI transitions " + progress.rightSwipesConfirmed,
    "local pending " + progress.rightSwipesReserved,
    "server day " + proof.dayKey,
    "server attempts " + proof.attempts,
    "server UI transitions " + proof.uiObserved,
    "server reviewed unknown " + proof.reviewedUnknown,
    "server unresolved " + proof.unresolvedAcrossDays
  ].join(" · ");
}
