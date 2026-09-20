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
