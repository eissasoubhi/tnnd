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
  notClicked: number;
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
      !integer(v.notClicked) || !integer(v.unresolvedAcrossDays) ||
      v.uiObserved + v.reviewedUnknown + v.notClicked > v.attempts) return null;
  return {
    dayKey: expectedDay, attempts: v.attempts,
    uiObserved: v.uiObserved, reviewedUnknown: v.reviewedUnknown,
    notClicked: v.notClicked, unresolvedAcrossDays: v.unresolvedAcrossDays
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
  // Rebuild only UI-observed bookkeeping from the authenticated, account/day
  // server ledger. After a worker crash, more than ONE acknowledged UI
  // transition may be absent locally. An arbitrary one-transition ceiling is
  // not evidence of safety; a fully resolved ledger is. These are observed
  // card transitions, NOT proof Tinder accepted the Likes.
  //
  // Never retry an attempt, roll back a local observation, alter daily
  // sessions or credit consumed server attempt slots.
  if (progress.dayKey !== proof.dayKey)
    return { ok: false, reason: "reservation_day_mismatch" };
  if (progress.rightSwipesReserved > 1 ||
      (progress.rightSwipesReserved === 1 && proof.reviewedUnknown !== 1))
    return { ok: false, reason: "reservation_count_mismatch" };
  // Even a locally unreserved day must not rearm while any server attempt is
  // unresolved or missing a known final classification.
  if (proof.attempts !== proof.uiObserved + proof.reviewedUnknown + proof.notClicked)
    return { ok: false, reason: "server_attempts_not_fully_resolved" };
  // Older interrupted workers sometimes persisted a card transition locally
  // that the server later classified as the ONE manually reviewed UNKNOWN.
  // The screenshot-shaped case (local 460 + pending 1, server 459 UI +
  // reviewed UNKNOWN 1) is safe to normalize: the server is authoritative
  // about bookkeeping, and we never repeat, relabel or send that attempt.
  const localAhead = Math.max(0, progress.rightSwipesConfirmed - proof.uiObserved);
  if (localAhead > 0 &&
      (progress.rightSwipesReserved !== 1 || localAhead !== proof.reviewedUnknown))
    return { ok: false, reason: "local_observed_count_mismatch" };
  if (progress.rightSwipesConfirmed + progress.rightSwipesReserved >
      proof.attempts + localAhead)
    return { ok: false, reason: "local_attempt_count_exceeds_server" };
  const changed = progress.rightSwipesReserved !== 0 ||
    progress.rightSwipesConfirmed !== proof.uiObserved;
  return {
    ok: true, changed,
    progress: changed ? {
      ...progress,
      rightSwipesConfirmed: proof.uiObserved,
      rightSwipesReserved: 0
    } : progress
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
    "server verified no-click " + proof.notClicked,
    "server unresolved " + proof.unresolvedAcrossDays
  ].join(" · ");
}
