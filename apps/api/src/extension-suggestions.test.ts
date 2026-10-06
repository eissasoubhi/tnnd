import assert from "node:assert/strict";
import test from "node:test";
import { generateExtensionSuggestions, validateExtensionSuggestionRequest } from "./extension-suggestions.js";

test("validates bounded extension suggestion requests", () => {
  const result = validateExtensionSuggestionRequest({
    context: "Them: hi",
    purpose: "preview",
    count: 2,
    config: { tone: "playful" },
    chat: { stage: "discovery" }
  });
  assert.equal(result.count, 2);
  assert.equal(result.purpose, "preview");
});

test("uses stored per-user Gemini settings without returning the API key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await generateExtensionSuggestions(
    "user-1",
    {
      context: "Them: salut",
      purpose: "manual",
      count: 1,
      config: { tone: "chill", languages: { fr: 80, darija: 20, en: 0 } }
    },
    async () => ({ provider: "gemini", model: "gemini-test", apiKey: "server-secret" }),
    async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "[\"salut 😄\"]" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  );

  assert.deepEqual(result, { suggestions: ["salut 😄"], model: "gemini-test" });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /gemini-test:generateContent$/);
  assert.equal(new Headers(calls[0]!.init?.headers).get("x-goog-api-key"), "server-secret");
  assert.equal(JSON.stringify(result).includes("server-secret"), false);
});
