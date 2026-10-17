import assert from "node:assert/strict";
import test from "node:test";
import { parseSmartSwipeAttemptSummary } from "./smart-swipe-dashboard-model.js";
test("valid ledger", () => {
  assert.equal(parseSmartSwipeAttemptSummary(null), null);
});
