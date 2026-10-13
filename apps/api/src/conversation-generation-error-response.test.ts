import assert from "node:assert/strict";
import test from "node:test";
import { generationErrorResponse } from "./conversation-generation-error-response.js";
import { GenerationStageFailure } from "./conversation-generation-stage.js";

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

test("exposes only fixed generation stages for missing optional SQL tables", () => {
  const cause = Object.assign(new Error("private SQL content and personal messages"), { code: "42P01" });
  const response = generationErrorResponse(new GenerationStageFailure("summary", cause));
  assert.deepEqual(response, { status: 500, body: { error: "generation_schema_missing", stage: "summary" } });
  assert.ok(!JSON.stringify(response).includes("private"));
});
test("other stage failure reveals no original exception or query", () => {
  const response = generationErrorResponse(new GenerationStageFailure("provider-settings", new Error("password@example.com")));
  assert.deepEqual(response, { status: 500, body: { error: "generation_context_unavailable", stage: "provider-settings" } });
});

test("maps unfinished structured output to safe provider errors", () => {
  assert.deepEqual(generationErrorResponse(new Error("gemini_output_truncated")), {status:502,body:{error:"gemini_output_truncated"}});
  assert.deepEqual(generationErrorResponse(new Error("gemini_invalid_output")), {status:502,body:{error:"gemini_invalid_output"}});
});
