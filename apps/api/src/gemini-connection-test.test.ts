import assert from "node:assert/strict";
import test from "node:test";
import { testGeminiConnection } from "./gemini-connection-test.js";

const settings = { provider: "gemini" as const, model: "gemini-3.8-flash", apiKey: "test-key" };

test("tests real Gemini generation without exposing the key", async () => {
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await testGeminiConnection(
    "user-1",
    async () => settings,
    async (input, init) => {
      requestedUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "OK" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  );

  assert.deepEqual(result, { provider: "gemini", model: "gemini-3.8-flash", connected: true });
  assert.match(requestedUrl, /gemini-3\.8-flash:generateContent$/);
  assert.equal(new Headers(requestInit?.headers).get("x-goog-api-key"), "test-key");
  assert.equal(requestInit?.method, "POST");
  assert.equal(JSON.stringify(result).includes("test-key"), false);
});

test("rejects connection test when Gemini is not configured", async () => {
  await assert.rejects(
    () => testGeminiConnection("user-1", async () => null, async () => new Response()),
    /ai_provider_not_configured/
  );
});

test("classifies rejected Gemini credentials", async () => {
  await assert.rejects(
    () => testGeminiConnection("user-1", async () => settings, async () => new Response("", { status: 403 })),
    /gemini_credentials_rejected/
  );
});

test("classifies a model that is visible but unavailable for generation", async () => {
  await assert.rejects(
    () => testGeminiConnection("user-1", async () => settings, async () => new Response("", { status: 404 })),
    /gemini_model_unavailable/
  );
});
