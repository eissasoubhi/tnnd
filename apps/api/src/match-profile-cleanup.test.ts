import assert from "node:assert/strict";
import test from "node:test";
import { resetMatchProfileCleanupState, runMatchProfileCleanup } from "./match-profile-cleanup.js";

test("cleanup runs once inside the configured interval", async () => {
  resetMatchProfileCleanupState();
  let calls = 0;
  const deleteExpired = async () => { calls += 1; return 3; };
  const first = await runMatchProfileCleanup({ now: new Date("2026-09-14T10:00:00Z"), minIntervalMs: 60_000, deleteExpired });
  const second = await runMatchProfileCleanup({ now: new Date("2026-09-14T10:00:30Z"), minIntervalMs: 60_000, deleteExpired });
  assert.equal(first.ran, true);
  assert.equal(first.deleted, 3);
  assert.equal(second.ran, false);
  assert.equal(calls, 1);
});

test("cleanup becomes eligible again after the interval", async () => {
  resetMatchProfileCleanupState();
  let calls = 0;
  const deleteExpired = async () => { calls += 1; return 1; };
  await runMatchProfileCleanup({ now: new Date("2026-09-14T10:00:00Z"), minIntervalMs: 60_000, deleteExpired });
  const later = await runMatchProfileCleanup({ now: new Date("2026-09-14T10:01:01Z"), minIntervalMs: 60_000, deleteExpired });
  assert.equal(later.ran, true);
  assert.equal(calls, 2);
});
