import assert from "node:assert/strict";
import test from "node:test";
import { accountDayKey, canClaimAttempt, UUID_PATTERN } from "./smart-swipe-attempt-ledger.js";
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
