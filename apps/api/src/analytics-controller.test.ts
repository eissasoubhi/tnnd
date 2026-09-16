import assert from "node:assert/strict";
import test from "node:test";
import { handleAnalyticsRequest } from "./analytics-controller.js";
import type { AnalyticsSnapshot } from "./analytics-service.js";

const snapshot: AnalyticsSnapshot = {
  generatedAt: "2026-09-16T00:00:00.000Z",
  operational: {
    active: 2,
    waitingForThem: 1,
    waitingForUser: 0,
    actionRequired: 1,
    paused: 0,
    disabled: 0,
    movedOffTinder: 0,
    stale: 0,
    archived: 0
  },
  topics: [],
  memoryCoverage: []
};

test("analytics controller returns the authenticated user's snapshot", async () => {
  let requestedUserId = "";
  const result = await handleAnalyticsRequest(" user-123 ", async (userId) => {
    requestedUserId = userId;
    return snapshot;
  });
  assert.equal(requestedUserId, "user-123");
  assert.deepEqual(result, { status: 200, body: snapshot });
});

test("analytics controller rejects an empty authenticated user id", async () => {
  const result = await handleAnalyticsRequest("   ", async () => snapshot);
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("analytics controller maps loader failures without leaking details", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const result = await handleAnalyticsRequest("user-123", async () => {
      throw new Error("database detail that must not leak");
    });
    assert.deepEqual(result, { status: 500, body: { error: "analytics_unavailable" } });
  } finally {
    console.error = originalError;
  }
});
