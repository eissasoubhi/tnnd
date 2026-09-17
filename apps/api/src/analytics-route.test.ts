import assert from "node:assert/strict";
import test from "node:test";
import { analyticsCapability, analyticsRoutePath, dispatchAnalyticsRoute, handleAuthenticatedAnalyticsRoute, isAnalyticsRoute } from "./analytics-route.js";
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

test("analytics HTTP contract exposes one versioned GET route", () => {
  assert.equal(analyticsRoutePath, "/api/v1/analytics");
  assert.equal(analyticsCapability, "analytics");
  assert.equal(isAnalyticsRoute("GET", "/api/v1/analytics"), true);
  assert.equal(isAnalyticsRoute("POST", "/api/v1/analytics"), false);
  assert.equal(isAnalyticsRoute("GET", "/api/v1/analytics/other"), false);
});

test("analytics dispatcher ignores unrelated routes", async () => {
  let authenticated = false;
  const result = await dispatchAnalyticsRoute("GET", "/api/v1/profile", async () => {
    authenticated = true;
    return { user: { id: "user-123" } };
  });
  assert.equal(result, null);
  assert.equal(authenticated, false);
});

test("analytics dispatcher handles the canonical route", async () => {
  const result = await dispatchAnalyticsRoute(
    "GET",
    analyticsRoutePath,
    async () => ({ user: { id: "user-123" } }),
    async () => snapshot
  );
  assert.deepEqual(result, { status: 200, body: snapshot });
});

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
