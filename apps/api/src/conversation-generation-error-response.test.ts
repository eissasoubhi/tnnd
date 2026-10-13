import assert from "node:assert/strict";
import test from "node:test";
import { generationErrorResponse } from "./conversation-generation-error-response.js";

test("maps known generation/provider failures to safe actionable response codes", () => {
  assert.deepEqual(generationErrorResponse(new Error("gemini_not_configured")), { status: 422, body: {error:"gemini_not_configured"} });
  assert.deepEqual(generationErrorResponse(new Error("gemini_provider_error:429")), { status: 429, body: {error:"gemini_rate_limited"} });
  assert.deepEqual(generationErrorResponse(new Error("gemini_provider_error:404")), { status: 502, body: {error:"gemini_model_unavailable"} });
  assert.deepEqual(generationErrorResponse(new Error("gemini_provider_error:403")), { status: 502, body: {error:"gemini_credentials_rejected"} });
  assert.deepEqual(generationErrorResponse(new Error("gemini_empty_response")), { status: 502, body: {error:"gemini_empty_response"} });
});
test("does not leak provider exception text or personal user information", () => {
  const answer = generationErrorResponse(new Error("private user email someone@example.org and API key abcdefgh"));
  assert.deepEqual(answer, { status: 500, body: { error: "internal_error" } });
});
