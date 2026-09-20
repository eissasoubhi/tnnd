import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { handleProductionAiRequest } from "./production-ai-route.js";

function request(method: string): IncomingMessage {
  return { method, headers: {} } as IncomingMessage;
}

test("ignores unrelated routes", async () => {
  assert.equal(await handleProductionAiRequest(request("GET"), "/health"), null);
});

test("dispatches provider settings route before reading credentials", async () => {
  const result = await handleProductionAiRequest(
    request("PUT"),
    "/api/v1/ai/provider-settings",
    { provider: "gemini", model: "gemini-2.5-flash", apiKey: "placeholder-not-a-real-key" }
  );
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("dispatches Gemini connection test route", async () => {
  const result = await handleProductionAiRequest(request("POST"), "/api/v1/ai/test-connection");
  assert.deepEqual(result, { status: 401, body: { error: "invalid_or_expired_session" } });
});
