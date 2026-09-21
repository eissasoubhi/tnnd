import assert from "node:assert/strict";
import test from "node:test";
import { AiProviderApiError, createAiProviderClient } from "./ai-provider-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("AI provider client sends authenticated production requests", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/provider-settings") && init?.method === "PUT") {
      return jsonResponse({ provider: "gemini", model: "gemini-2.5-flash", configured: true });
    }
    if (String(input).endsWith("/test-connection")) {
      return jsonResponse({ provider: "gemini", model: "gemini-2.5-flash", connected: true });
    }
    return jsonResponse({ provider: "gemini", model: "gemini-2.5-flash", configured: true, updatedAt: "2026-01-01T00:00:00.000Z" });
  };

  const client = createAiProviderClient("session-token", { baseUrl: "https://tnnd.example/", fetchImpl });
  await client.getSettings();
  await client.saveSettings({ apiKey: "test-only-key", model: "gemini-2.5-flash" });
  await client.testConnection();

  assert.deepEqual(calls.map(({ url, init }) => [url, init?.method]), [
    ["https://tnnd.example/api/v1/ai/provider-settings", "GET"],
    ["https://tnnd.example/api/v1/ai/provider-settings", "PUT"],
    ["https://tnnd.example/api/v1/ai/test-connection", "POST"]
  ]);
  for (const call of calls) {
    assert.equal(new Headers(call.init?.headers).get("authorization"), "Bearer session-token");
  }
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    apiKey: "test-only-key",
    model: "gemini-2.5-flash"
  });
});

test("AI provider client preserves API status and error code", async () => {
  const client = createAiProviderClient("expired", {
    fetchImpl: async () => jsonResponse({ error: "invalid_or_expired_session" }, 401)
  });

  await assert.rejects(client.getSettings(), (error: unknown) => {
    assert.ok(error instanceof AiProviderApiError);
    assert.equal(error.status, 401);
    assert.equal(error.code, "invalid_or_expired_session");
    return true;
  });
});
