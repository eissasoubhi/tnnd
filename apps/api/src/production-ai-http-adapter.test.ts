import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { handleProductionAiHttpRequest } from "./production-ai-http-adapter.js";

test("ignores non-AI paths without consuming the request body", async () => {
  let bodyReads = 0;
  const request = { method: "PUT" } as IncomingMessage;

  const result = await handleProductionAiHttpRequest(request, "/api/v1/profile", async () => {
    bodyReads += 1;
    return { apiKey: "must-not-be-read" };
  });

  assert.equal(result, null);
  assert.equal(bodyReads, 0);
});

test("does not consume a body for the Gemini connection test route", async () => {
  let bodyReads = 0;
  const request = { method: "POST", headers: {} } as IncomingMessage;

  await handleProductionAiHttpRequest(request, "/api/v1/ai/test-connection", async () => {
    bodyReads += 1;
    return { apiKey: "must-not-be-read" };
  });

  assert.equal(bodyReads, 0);
});

test("does not consume a body for unsupported methods on provider settings", async () => {
  let bodyReads = 0;
  const request = { method: "GET", headers: {} } as IncomingMessage;

  await handleProductionAiHttpRequest(request, "/api/v1/ai/provider-settings", async () => {
    bodyReads += 1;
    return { apiKey: "must-not-be-read" };
  });

  assert.equal(bodyReads, 0);
});
