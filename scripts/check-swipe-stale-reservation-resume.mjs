import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { classifySwipePopupState } from "../src/tinder-smart-swipe-popup-state.ts";
import { emptySmartSwipeDay } from "../src/tinder-smart-auto-swipe-policy.ts";
import { readSmartSwipeProgress } from "../src/tinder-smart-swipe-progress-store.ts";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("a 2-day-old Reserved stays recorded but no longer disables a fresh Start", () => {
  assert.equal(classifySwipePopupState({
    enabled: true, armed: false, unresolvedOnServer: 1,
    blockingUnresolvedOnServer: 0
  }).startDisabled, false);
  assert.equal(classifySwipePopupState({
    enabled: true, armed: false, unresolvedOnServer: 1,
    blockingUnresolvedOnServer: 1
  }).startDisabled, true);
  const old = { ...emptySmartSwipeDay("2026-11-07"), rightSwipesReserved: 1 };
  assert.equal(readSmartSwipeProgress(old, Date.parse("2026-11-09T12:00:00Z"),
    "Europe/Paris").ok, false, "ordinary rollover still cannot silently discard a claim");
  assert.equal(old.rightSwipesReserved, 1);
});

test("old unknown stays in backend ledger, never becomes accepted Like or a reused attempt", async () => {
  const [api, start, runtime] = await Promise.all([
    "apps/api/src/smart-swipe-attempt-ledger.ts",
    "src/tinder-smart-swipe-automation-background.ts",
    "src/tinder-smart-swipe-runtime-background.ts"
  ].map(read));
  assert.match(api, /STALE_ATTEMPT_GRACE_SECONDS = 300/);
  assert.match(api, /created_at >= now\(\) - \(\$2::text \|\| ' seconds'\)::interval/);
  assert.match(api, /blockingUnresolvedAttempts: Number\(row\?\.blocking_unresolved/);
  assert.match(api, /status='reserved' OR \(status='uncertain' AND reviewed_at IS NULL\)/);
  assert.match(start, /summary\?\.blockingUnresolvedAttempts === 0/);
  assert.match(start, /summary\.unresolvedAttempts === proof\.unresolvedAcrossDays/);
  assert.match(start, /stale_unknown_not_retried/);
  assert.match(start, /const attemptId = crypto\.randomUUID\(\)/);
  assert.match(start, /authenticatedPost<AttemptClaim>/);
  assert.match(start, /STORAGE_STALE_RESERVATIONS/);
  assert.match(runtime, /Read-only status preview/);
  assert.match(runtime, /serverAttempts\?\.blockingUnresolvedAttempts === 0/);
});
