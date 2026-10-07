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
  const body = JSON.parse(String(calls[0]!.init?.body));
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
  assert.equal(body.generationConfig.maxOutputTokens, 2048);
  assert.deepEqual(body.generationConfig.responseSchema, {
    type: "ARRAY",
    minItems: 1,
    maxItems: 1,
    items: { type: "STRING" }
  });
  assert.equal(JSON.stringify(result).includes("server-secret"), false);
});


test("classifies Gemini models unavailable for generation", async () => {
  await assert.rejects(
    () => generateExtensionSuggestions(
      "user-1",
      {
        context: "Them: salut",
        purpose: "preview",
        count: 1,
        config: { tone: "chill" }
      },
      async () => ({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "server-secret" }),
      async () => new Response("", { status: 404 })
    ),
    /gemini_model_unavailable/
  );
});


test("classifies truncated Gemini output before JSON parsing", async () => {
  await assert.rejects(
    () => generateExtensionSuggestions(
      "user-1",
      {
        context: "Them: salut",
        purpose: "preview",
        count: 1,
        config: { tone: "chill" }
      },
      async () => ({ provider: "gemini", model: "gemini-3.8-flash", apiKey: "server-secret" }),
      async () => new Response(JSON.stringify({
        candidates: [{
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "[\"message cut off" }] }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } })
    ),
    /gemini_response_truncated/
  );
});

test("classifies malformed structured output without leaking parser details", async () => {
  await assert.rejects(
    () => generateExtensionSuggestions(
      "user-1",
      {
        context: "Them: salut",
        purpose: "preview",
        count: 1,
        config: { tone: "chill" }
      },
      async () => ({ provider: "gemini", model: "gemini-3.8-flash", apiKey: "server-secret" }),
      async () => new Response(JSON.stringify({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[\"unterminated" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } })
    ),
    /gemini_invalid_suggestions/
  );
});
