import assert from "node:assert/strict";
import {
  parseDayReconciliationProof, reconcileReviewedLocalSwipeAttempt, publicSwipeReconciliationCounts
} from "../src/tinder-smart-swipe-reconciliation.ts";
import { emptySmartSwipeDay } from "../src/tinder-smart-auto-swipe-policy.ts";
import { readFileSync } from "node:fs";

const dayKey = "2026-10-18";
const initial = { ...emptySmartSwipeDay(dayKey), startedSessions: 1,
  rightSwipesConfirmed: 1, rightSwipesReserved: 1 };
const evidence = { dayKey, attempts: 2, uiObserved: 1, reviewedUnknown: 1,
  notClicked: 0, unresolvedAcrossDays: 0 };
const parsed = parseDayReconciliationProof(evidence, dayKey);
assert.ok(parsed);
const reconciled = reconcileReviewedLocalSwipeAttempt(initial, parsed);
assert.equal(reconciled.ok, true);
assert.equal(reconciled.progress.rightSwipesReserved, 0);
assert.equal(reconciled.progress.rightSwipesConfirmed, 1);
assert.equal(reconciled.progress.startedSessions, 1);
assert.equal(initial.rightSwipesReserved, 1);

// Synthetic match of an account-day with 39 slots and 36 UI transitions:
// one explicitly reviewed UNKNOWN + two verified no-clicks. Those two
// remain consumed quota slots, not extra Likes or local confirmations.
const accountDayWithNoClicks = {
  ...evidence, attempts: 39, uiObserved: 36, reviewedUnknown: 1, notClicked: 2
};
const originalWithPending = {
  ...initial, rightSwipesConfirmed: 36, rightSwipesReserved: 1
};
const withNoClicks = reconcileReviewedLocalSwipeAttempt(
  originalWithPending, accountDayWithNoClicks
);
assert.equal(withNoClicks.ok, true);
if (withNoClicks.ok) {
  assert.equal(withNoClicks.progress.rightSwipesConfirmed, 36);
  assert.equal(withNoClicks.progress.rightSwipesReserved, 0);
}
assert.equal(originalWithPending.rightSwipesReserved, 1);
assert.match(publicSwipeReconciliationCounts(originalWithPending, accountDayWithNoClicks),
  /server verified no-click 2/);
assert.equal(parseDayReconciliationProof({ ...evidence, notClicked: undefined }, dayKey), null,
  "old APIs missing the no-click count must fail closed");
assert.equal(parseDayReconciliationProof({ ...evidence, notClicked: -1 }, dayKey), null);
assert.equal(parseDayReconciliationProof({ ...evidence, notClicked: 1 }, dayKey), null,
  "impossible overcount must be rejected before local rearm");
assert.equal(reconcileReviewedLocalSwipeAttempt(initial, {
  ...evidence, reviewedUnknown: 0, notClicked: 1
}).ok, false, "a no-click alone can never clear an unknown local reservation");
assert.equal(reconcileReviewedLocalSwipeAttempt(initial, {
  ...evidence, attempts: 3, notClicked: 0
}).ok, false, "extra unexplained statuses must still fail closed");

// Real crash-window shape: PostgreSQL recorded 1 card transition and 1
// manually reviewed UNKNOWN, but Chrome persisted neither local UI counter.
// Safe: restore UI-only evidence from the account-scoped server ledger.
const missedLocalWrite = { ...initial, rightSwipesConfirmed: 0 };
const recovered = reconcileReviewedLocalSwipeAttempt(missedLocalWrite, evidence);
assert.equal(recovered.ok, true, "must recover one lost local UI-observed write");
if (recovered.ok) {
  assert.equal(recovered.changed, true);
  assert.equal(recovered.progress.rightSwipesConfirmed, 1);
  assert.equal(recovered.progress.rightSwipesReserved, 0);
  assert.equal(recovered.progress.startedSessions, initial.startedSessions);
}
assert.equal(missedLocalWrite.rightSwipesConfirmed, 0, "original state remains immutable");

// Refuse larger gaps, local-ahead counters, multiple pending reservations,
// cross-day evidence, and extra server attempts not fully accounted for.
for (const [local, remote, expectedReason] of [
  [{ ...initial, rightSwipesConfirmed: 0 },
    { ...evidence, attempts: 3, uiObserved: 2 }, "local_observed_count_mismatch"],
  [{ ...initial, rightSwipesConfirmed: 2 }, evidence, "local_observed_count_mismatch"],
  [{ ...initial, rightSwipesReserved: 2 }, evidence, "reservation_count_mismatch"],
  [{ ...initial, dayKey: "2026-10-17" }, evidence, "reservation_day_mismatch"],
  [initial, { ...evidence, attempts: 3 }, "server_attempts_not_fully_resolved"],
  [initial, { ...evidence, reviewedUnknown: 2, attempts: 3 }, "reservation_count_mismatch"]
]) {
  const outcome = reconcileReviewedLocalSwipeAttempt(local, remote);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, expectedReason);
}
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
assert.ok(runner.includes('if (!review.ok) return {') &&
  runner.includes('ok: false, reason: review.reason,'),
  "unmatched unknown reservations must fail closed");
const sanitized = publicSwipeReconciliationCounts(missedLocalWrite, evidence);
assert.match(sanitized, /local UI transitions 0/);
assert.match(sanitized, /server UI transitions 1/);
assert.match(sanitized, /server reviewed unknown 1/);
assert.doesNotMatch(sanitized, /userId|deviceId|token|profile|tinder.com/);
const popup = readFileSync(new URL("../src/popup.ts", import.meta.url),"utf8");
assert.ok(popup.includes("Start refused: ") && popup.includes("Diagnostic counts: "),
  "a rejected Start should show safe counts, not imply the runner is running");
assert.ok(popup.includes("No automatic swiping session was launched."),
  "a failed Start must not be confused with a failed Stop");
assert.ok(popup.includes("Disable TNND in chrome://extensions if you need to stop immediately."),
  "emergency Stop guidance must remain available only for Stop failures");
console.log("Smart Swipe review/rearm proof and no-retry guards passed.");
