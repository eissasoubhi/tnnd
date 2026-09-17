import assert from "node:assert/strict";
import test from "node:test";
import { dispatchPlatformRoute } from "./platform-route-dispatcher.js";

test("platform dispatcher exposes canonical API metadata", async () => {
  const result = await dispatchPlatformRoute("GET", "/api/v1/meta", {
    authenticate: async () => null
  });

  assert.equal(result?.status, 200);
  assert.equal((result?.body as { apiVersion: string }).apiVersion, "v1");
  assert.ok((result?.body as { capabilities: string[] }).capabilities.includes("analytics"));
});

test("platform dispatcher delegates authenticated analytics", async () => {
  const result = await dispatchPlatformRoute("GET", "/api/v1/analytics", {
    authenticate: async () => ({ user: { id: "user-123" } }),
    loadAnalyticsSnapshot: async (userId) => ({
      generatedAt: `for-${userId}`,
      operational: {
        active: 0,
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
    })
  });

  assert.equal(result?.status, 200);
  assert.equal((result?.body as { generatedAt: string }).generatedAt, "for-user-123");
});

test("platform dispatcher ignores unrelated routes", async () => {
  const result = await dispatchPlatformRoute("POST", "/api/v1/meta", {
    authenticate: async () => null
  });
  assert.equal(result, null);
});
