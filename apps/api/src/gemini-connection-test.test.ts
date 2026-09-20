import assert from "node:assert/strict";
import test from "node:test";
import { testGeminiConnection } from "./gemini-connection-test.js";

const settings = { provider: "gemini" as const, model: "gemini-2.5-flash", apiKey: "test-key" };

test("tests configured Gemini credentials without exposing the key", async () => {
  let requestedUrl = "";
  const result = await testGeminiConnection(
    "user-1",
    async () => settings,
    async (input) => {
      requestedUrl = String(input);
      return new Response("{}", { status: 200 });
    }
  );

  assert.deepEqual(result, { provider: "gemini", model: "gemini-2.5-flash", connected: true });
  assert.match(requestedUrl, /gemini-2\.5-flash/);
  assert.match(requestedUrl, /key=test-key/);
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
