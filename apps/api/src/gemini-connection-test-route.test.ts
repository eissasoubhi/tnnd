import assert from "node:assert/strict";
import test from "node:test";
import { handleGeminiConnectionTestRoute } from "./gemini-connection-test-route.js";

function request(method: string, authorization?: string) {
  return { method, headers: authorization ? { authorization } : {} } as never;
}

const session = { user: { id: "user-test" } } as never;

test("Gemini test route ignores unrelated requests", async () => {
  assert.equal(await handleGeminiConnectionTestRoute(request("GET"), "/api/v1/meta", async () => session), null);
});

test("Gemini test route requires authentication", async () => {
  const result = await handleGeminiConnectionTestRoute(request("POST"), "/api/v1/ai/test-connection", async () => null);
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("Gemini test route returns safe connection result", async () => {
  const result = await handleGeminiConnectionTestRoute(
    request("POST", "Bearer test-token"),
    "/api/v1/ai/test-connection",
    async () => session,
    async (userId) => {
      assert.equal(userId, "user-test");
      return { provider: "gemini", model: "gemini-test", connected: true };
    }
  );
  assert.deepEqual(result, { status: 200, body: { provider: "gemini", model: "gemini-test", connected: true } });
  assert.equal(JSON.stringify(result).includes("apiKey"), false);
});

test("Gemini test route maps provider errors without exposing secrets", async () => {
  const result = await handleGeminiConnectionTestRoute(
    request("POST", "Bearer test-token"),
    "/api/v1/ai/test-connection",
    async () => session,
    async () => { throw new Error("gemini_credentials_rejected"); }
  );
  assert.deepEqual(result, { status: 422, body: { error: "gemini_credentials_rejected" } });
});
