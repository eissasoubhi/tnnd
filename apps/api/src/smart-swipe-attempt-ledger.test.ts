import assert from "node:assert/strict";
import test from "node:test";
import { accountDayKey, canClaimAttempt, UUID_PATTERN, SMART_SWIPE_OUTCOME_REASONS, safeSwipeOutcomeReason, validSmartSwipeDayKey, REVIEW_UNKNOWN_ACKNOWLEDGEMENT } from "./smart-swipe-attempt-ledger.js";
test("attempt claiming is idempotent, quota-bound, and refuses uncertain prior actions", () => {
  assert.equal(canClaimAttempt(0, 10, false, false), "ready");
  assert.equal(canClaimAttempt(9, 10, false, false), "ready");
  assert.equal(canClaimAttempt(10, 10, false, false), "daily_cap");
  assert.equal(canClaimAttempt(0, 10, true, false), "unresolved");
  assert.equal(canClaimAttempt(0, 10, false, true), "duplicate");
  assert.equal(canClaimAttempt(-1, 10, false, false), "invalid");
  assert.equal(UUID_PATTERN.test("00000000-0000-4000-8000-000000000123"), true);
  assert.equal(UUID_PATTERN.test("not-uuid"), false);
});
test("account-local date key respects DST and Paris midnight", () => {
  assert.equal(accountDayKey(Date.parse("2026-10-16T22:30:00Z"), "Europe/Paris"), "2026-10-17");
  assert.equal(accountDayKey(Date.parse("2026-10-16T22:30:00Z"), "America/New_York"), "2026-10-16");
  assert.throws(() => accountDayKey(Date.now(), "Unknown/Invalid"));
});

test("only non-identifying executor codes are accepted for outcome diagnostics", () => {
  for (const reason of SMART_SWIPE_OUTCOME_REASONS) {
    assert.equal(safeSwipeOutcomeReason(reason === "new_card_visually_observed"
      ? "ui_observed" : "uncertain", reason), true, reason);
  }
  assert.equal(safeSwipeOutcomeReason("uncertain", "new_card_visually_observed"), false);
  assert.equal(safeSwipeOutcomeReason("ui_observed", "card_transition_timeout"), false);
  assert.equal(safeSwipeOutcomeReason("uncertain", "private user contact +33612345678"), false);
  assert.equal(safeSwipeOutcomeReason("uncertain", "http://tinder.com/private/profile"), false);
  assert.equal(safeSwipeOutcomeReason("uncertain", { profile: "private" }), false);
  assert.equal(safeSwipeOutcomeReason("uncertain", null), false);
  assert.equal(safeSwipeOutcomeReason("uncertain", ""), false);
});

test("manual review requires an explicit unknown-outcome acknowledgement and canonical account day", () => {
  assert.equal(REVIEW_UNKNOWN_ACKNOWLEDGEMENT, "acknowledge_unknown_no_retry");
  assert.equal(validSmartSwipeDayKey("2026-10-18"), true);
  assert.equal(validSmartSwipeDayKey("2026-10-18/another-user"), false);
  assert.equal(validSmartSwipeDayKey("2026-99-99"), false);
  assert.equal(validSmartSwipeDayKey(null), false);
});
