import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiConversationProvider, parseGenerationOutput, type GeminiGenerationInput } from "./gemini-provider.js";

test("extracts only the reply from Gemini's structured JSON, including fenced output", () => {
  assert.deepEqual(parseGenerationOutput('{"text":"Salut, ça va ?","usedPersonalMemoryId":null}', []), { text: "Salut, ça va ?" });
  assert.deepEqual(parseGenerationOutput('```json\n{"text":"Hello !","usedPersonalMemoryId":"mem-1"}\n```', ["mem-1"]), { text: "Hello !", usedPersonalMemoryId: "mem-1" });
  assert.deepEqual(parseGenerationOutput('{"text":"Hi","usedPersonalMemoryId":"unknown"}', ["mem-1"]), { text: "Hi" });
});

test("rejects incomplete Gemini JSON and never exposes the raw envelope as a reply", () => {
  for (const payload of [
    '{"text":"Hello, Casa mais sur Paris',
    '{"text":',
    '{"usedPersonalMemoryId":null}',
    "not a JSON reply",
    '{"text":""}',
    '{"text":"{\\"text\\":\\"Hello"}'
  ]) assert.throws(() => parseGenerationOutput(payload, []), /gemini_invalid_output/);
});

test("handles double encoded valid objects safely", () => {
  const json = '{"text":"Bonjour !"}';
  assert.equal(parseGenerationOutput(JSON.stringify(json), []).text, "Bonjour !");
});

test("truncated Gemini candidate is rejected even if it contains a partial text field", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async (_endpoint: URL | RequestInfo, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { generationConfig?: { maxOutputTokens?: number } };
    assert.ok((request.generationConfig?.maxOutputTokens ?? 0) >= 1024);
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"text":"Hi' }] } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const fn = createGeminiConversationProvider({ apiKey: "local-fixture-key", model: "fixture-model" });
    await assert.rejects(fn({ latestMessage: "Hi", context: {} } as GeminiGenerationInput), /gemini_output_truncated/);
  } finally {
    globalThis.fetch = previous;
  }
});
