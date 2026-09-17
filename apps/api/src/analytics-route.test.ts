import assert from "node:assert/strict";
import test from "node:test";
import { handleAuthenticatedAnalyticsRoute } from "./analytics-route.js";
import type { AnalyticsSnapshot } from "./analytics-service.js";

const snapshot: AnalyticsSnapshot = {
  generatedAt: "2026-09-16T00:00:00.000Z",
  operational: {
    active: 1,
    waitingForThem: 0,
    waitingForUser: 0,
    actionRequired: 0,
    paused: 0,
    disabled: 0,
    movedOffTinder: 0,
    stale: 0,
    archived: 0
  },
  topics: [],
  memoryCoverage: []
};

test("analytics route requires an authenticated session", async () => {
  const result = await handleAuthenticatedAnalyticsRoute(async () => null, async () => snapshot);
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("analytics route scopes the snapshot to the authenticated user", async () => {
  let requestedUserId = "";
  const result = await handleAuthenticatedAnalyticsRoute(
    async () => ({ user: { id: "user-123" } }),
    async (userId) => {
      requestedUserId = userId;
      return snapshot;
    }
  );

  assert.equal(requestedUserId, "user-123");
  assert.deepEqual(result, { status: 200, body: snapshot });
});
