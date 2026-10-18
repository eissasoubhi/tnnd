import assert from "node:assert/strict";
import test from "node:test";
import { parseDayReconciliationProof, reconcileReviewedLocalSwipeAttempt } from "./tinder-smart-swipe-reconciliation.js";
import { emptySmartSwipeDay } from "./tinder-smart-auto-swipe-policy.js";

const dayKey = "2026-10-18";
const progress = {
  ...emptySmartSwipeDay(dayKey),
  rightSwipesConfirmed: 1, rightSwipesReserved: 1,
  startedSessions: 1,
  session: { durationMs: 300_000, activeElapsedMs: 34_000,
    runningSinceMs: null, nextRightSwipeNotBeforeMs: 10_000 }
};
const proof = {
  dayKey, attempts: 2, uiObserved: 1, reviewedUnknown: 1, unresolvedAcrossDays: 0
};

test("only an exact authenticated account-day proof can release one old local reservation", () => {
  const parsed = parseDayReconciliationProof(proof, dayKey);
  assert.ok(parsed);
  const reviewed = reconcileReviewedLocalSwipeAttempt(progress, parsed);
  assert.equal(reviewed.ok, true);
  if (!reviewed.ok) return;
  assert.equal(reviewed.changed, true);
  assert.equal(reviewed.progress.rightSwipesReserved, 0);
  assert.equal(reviewed.progress.rightSwipesConfirmed, 1, "UNKNOWN must never count as confirmed");
  assert.equal(reviewed.progress.startedSessions, 1, "review must not reset sessions");
  assert.deepEqual(reviewed.progress.session, progress.session);
  assert.equal(progress.rightSwipesReserved, 1, "no mutation of original evidence");
});

test("unknown/mismatched/server pending records cannot clear reservations", () => {
  for (const remote of [
    { ...proof, unresolvedAcrossDays: 1 },
    { ...proof, dayKey: "2026-10-17" },
    { ...proof, attempts: 3 },
    { ...proof, uiObserved: 0 },
    { ...proof, reviewedUnknown: 0 },
    { ...proof, reviewedUnknown: 2 },
  ]) {
    const result = reconcileReviewedLocalSwipeAttempt(progress, remote);
    assert.equal(result.ok, false, JSON.stringify(remote));
  }
  assert.equal(reconcileReviewedLocalSwipeAttempt(
    { ...progress, rightSwipesReserved: 2 }, proof
  ).ok, false);
  assert.equal(parseDayReconciliationProof({ ...proof, attempts: -1 }, dayKey), null);
  assert.equal(parseDayReconciliationProof({ ...proof, dayKey: "2026-10-17" }, dayKey), null);
  assert.equal(parseDayReconciliationProof({ ...proof, reviewedUnknown: NaN }, dayKey), null);
});

test("a clean local state remains unchanged only with no outstanding server attempts", () => {
  const clean = { ...progress, rightSwipesReserved: 0 };
  const result = reconcileReviewedLocalSwipeAttempt(clean, proof);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.changed, false);
  assert.equal(reconcileReviewedLocalSwipeAttempt(clean,
    { ...proof, unresolvedAcrossDays: 1 }).ok, false);
});
