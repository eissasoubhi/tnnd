import assert from "node:assert/strict";
import test from "node:test";
import type { AccountDataExport } from "./account-data-export-service.js";
import { handleAccountDataExportRoute } from "./account-data-export-route.js";

function request(method: string, authorization?: string) {
  return { method, headers: authorization ? { authorization } : {} } as never;
}

function exportFixture(): AccountDataExport {
  return {
    exportedAt: "2026-01-01T00:00:00.000Z",
    account: { id: "user-test" },
    profile: null,
    aiProvider: null,
    textingStyleSourceExamples: null,
    conversations: [],
    messages: [],
    humanActions: [],
    matchProfiles: [],
    personalMemories: [],
    conversationTopics: [],
    conversationTopicTransitions: []
  };
}

test("account export route ignores unrelated requests", async () => {
  const result = await handleAccountDataExportRoute(
    request("GET"),
    "/api/v1/meta",
    async () => null,
    async () => null
  );
  assert.equal(result, null);
});

test("account export route requires authentication", async () => {
  const result = await handleAccountDataExportRoute(
    request("GET"),
    "/api/v1/account/export",
    async () => null,
    async () => exportFixture()
  );
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("account export route rejects an invalid session", async () => {
  const result = await handleAccountDataExportRoute(
    request("GET", "Bearer invalid-test-token"),
    "/api/v1/account/export",
    async () => null,
    async () => exportFixture()
  );
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("account export route scopes the export to the authenticated account", async () => {
  let exportedUserId = "";
  const result = await handleAccountDataExportRoute(
    request("GET", "Bearer valid-test-token"),
    "/api/v1/account/export",
    async () => ({ user: { id: "user-test" } }),
    async (userId) => {
      exportedUserId = userId;
      return exportFixture();
    }
  );

  assert.equal(exportedUserId, "user-test");
  assert.deepEqual(result, { status: 200, body: { export: exportFixture() } });
});

test("account export route returns 404 when the authenticated account disappeared", async () => {
  const result = await handleAccountDataExportRoute(
    request("GET", "Bearer valid-test-token"),
    "/api/v1/account/export",
    async () => ({ user: { id: "user-test" } }),
    async () => null
  );

  assert.deepEqual(result, { status: 404, body: { error: "account_not_found" } });
});
