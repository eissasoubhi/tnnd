import assert from "node:assert/strict";
import {
  parseDayReconciliationProof, reconcileReviewedLocalSwipeAttempt
} from "../src/tinder-smart-swipe-reconciliation.ts";
import { emptySmartSwipeDay } from "../src/tinder-smart-auto-swipe-policy.ts";
import { readFileSync } from "node:fs";

const dayKey = "2026-10-18";
const initial = { ...emptySmartSwipeDay(dayKey), startedSessions: 1,
  rightSwipesConfirmed: 1, rightSwipesReserved: 1 };
const evidence = { dayKey, attempts: 2, uiObserved: 1, reviewedUnknown: 1,
  unresolvedAcrossDays: 0 };
const parsed = parseDayReconciliationProof(evidence, dayKey);
assert.ok(parsed);
const reconciled = reconcileReviewedLocalSwipeAttempt(initial, parsed);
assert.equal(reconciled.ok, true);
assert.equal(reconciled.progress.rightSwipesReserved, 0);
assert.equal(reconciled.progress.rightSwipesConfirmed, 1);
assert.equal(reconciled.progress.startedSessions, 1);
assert.equal(initial.rightSwipesReserved, 1);
for(const bad of [
  { ...evidence, unresolvedAcrossDays: 1 },
  { ...evidence, reviewedUnknown: 0 },
  { ...evidence, reviewedUnknown: 2 },
  { ...evidence, attempts: 3 },
  { ...evidence, uiObserved: 0 },
  { ...evidence, dayKey: "2026-10-17" }
]) {
  if (parseDayReconciliationProof(bad, dayKey) === null) continue;
  assert.equal(reconcileReviewedLocalSwipeAttempt(initial, bad).ok, false);
}
assert.equal(reconcileReviewedLocalSwipeAttempt(
  { ...initial, rightSwipesReserved: 2 }, evidence).ok, false);
assert.equal(parseDayReconciliationProof({ ...evidence, attempts: -1 }, dayKey), null);
const runner = readFileSync(new URL("../src/tinder-smart-swipe-automation-background.ts", import.meta.url), "utf8");
const proofAt = runner.indexOf("parseDayReconciliationProof(");
const rearmAt = runner.indexOf('"/api/v1/automation/smart-swipe/attempts/rearm"');
const armedAt = runner.indexOf("[key]: { armed: true");
assert.ok(proofAt > 0 && rearmAt > proofAt && armedAt > rearmAt,
  "explicit Start must obtain and match account-day proof BEFORE rearming");
assert.ok(runner.includes('if (!review.ok) return { ok: false, reason: review.reason };'),
  "unmatched unknown reservations must fail closed");
console.log("Smart Swipe review/rearm proof and no-retry guards passed.");
