import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiConversationProvider, type GeminiGenerationInput } from "./gemini-provider.js";

test("draft Gemini provider uses stored user's key and model without leaking the key", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (endpoint: URL | RequestInfo, init?: RequestInit) => {
    calls++;
    assert.match(String(endpoint), /models\/configured-test-model:generateContent/);
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.["x-goog-api-key"], "private_fixture_key");
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ text: "Hi there!" }) }] } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const generate = createGeminiConversationProvider({ model: "configured-test-model", apiKey: "private_fixture_key" });
    const output = await generate({ latestMessage: "Hi", context: {} } as GeminiGenerationInput);
    assert.equal(calls, 1);
    assert.equal(output.model, "configured-test-model");
    assert.equal(output.text, "Hi there!");
    assert.ok(!JSON.stringify(output).includes("private_fixture_key"));
  } finally {
    globalThis.fetch = original;
  }
});
