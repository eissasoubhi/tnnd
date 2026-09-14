import assert from "node:assert/strict";
import test from "node:test";
import { cleanupLogPayload } from "./match-profile-cleanup-command.js";

test("cleanup log payload exposes only operational metadata", () => {
  assert.deepEqual(cleanupLogPayload({
    ran: true,
    deleted: 3,
    startedAt: "2026-09-14T18:00:00.000Z",
    finishedAt: "2026-09-14T18:00:01.000Z"
  }), {
    event: "match_profile_cleanup_completed",
    deleted: 3,
    startedAt: "2026-09-14T18:00:00.000Z",
    finishedAt: "2026-09-14T18:00:01.000Z"
  });
});

test("cleanup log payload reports skipped runs", () => {
  assert.equal(cleanupLogPayload({
    ran: false,
    deleted: 0,
    startedAt: "2026-09-14T18:00:00.000Z",
    finishedAt: "2026-09-14T18:00:00.000Z"
  }).event, "match_profile_cleanup_skipped");
});
