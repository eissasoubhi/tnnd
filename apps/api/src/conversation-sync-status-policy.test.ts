import assert from "node:assert/strict";
import test from "node:test";
import { statusAfterPassiveSync } from "./conversation-sync-status-policy.js";

test("passive imports cannot resume closed, paused or human-action-blocked conversations", () => {
  for (const persisted of ["moved-off-tinder", "disabled", "paused", "archived", "action-required"] as const) {
    assert.equal(statusAfterPassiveSync("waiting-for-user", persisted), persisted);
    assert.equal(statusAfterPassiveSync("active", persisted), persisted);
    assert.equal(statusAfterPassiveSync(undefined, persisted), persisted);
  }
});
test("non-terminal statuses retain existing status and still permit ordinary sync inference", () => {
  assert.equal(statusAfterPassiveSync(undefined, "waiting-for-them"), "waiting-for-them");
  assert.equal(statusAfterPassiveSync("waiting-for-user", "waiting-for-them"), "waiting-for-user");
  assert.equal(statusAfterPassiveSync(undefined, undefined), "active");
});
