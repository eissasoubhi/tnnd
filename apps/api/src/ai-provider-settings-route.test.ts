import assert from "node:assert/strict";
import test from "node:test";
import { handleAiProviderSettingsRoute } from "./ai-provider-settings-route.js";

function request(method: string, authorization?: string) {
  return { method, headers: authorization ? { authorization } : {} } as never;
}

test("AI provider settings route ignores unrelated requests", async () => {
  const result = await handleAiProviderSettingsRoute(request("GET"), "/api/v1/meta", {}, async () => null);
  assert.equal(result, null);
});

test("AI provider settings route requires authentication", async () => {
  const result = await handleAiProviderSettingsRoute(
    request("PUT"),
    "/api/v1/ai/provider-settings",
    { model: "gemini-test", apiKey: "not-a-real-key" },
    async () => null
  );
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("AI provider settings route rejects an invalid session", async () => {
  const result = await handleAiProviderSettingsRoute(
    request("PUT", "Bearer invalid-test-token"),
    "/api/v1/ai/provider-settings",
    { model: "gemini-test", apiKey: "not-a-real-key" },
    async () => null
  );
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});
