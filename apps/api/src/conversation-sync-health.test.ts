import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationSyncHealth } from "./conversation-sync-health.js";

test("returns never-synced without a durable checkpoint", () => {
  assert.deepEqual(buildConversationSyncHealth(null), { state: "never-synced" });
});

test("returns lastSyncedAt without exposing the raw cursor", () => {
  const updatedAt = new Date("2026-09-14T04:00:00.000Z");
  assert.deepEqual(buildConversationSyncHealth(updatedAt), {
    state: "synced",
    lastSyncedAt: "2026-09-14T04:00:00.000Z",
  });
});
