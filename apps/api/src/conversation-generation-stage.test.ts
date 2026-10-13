import assert from "node:assert/strict";
import test from "node:test";
import { GenerationStageFailure, safeGenerationFailureLog, withGenerationStage } from "./conversation-generation-stage.js";

test("retains fixed stage while classifying absent database tables", async () => {
  const failure = await withGenerationStage("summary", async () => {
    throw Object.assign(new Error("sensitive SQL SELECT FROM conversation_summaries"), { code: "42P01" });
  }).catch(e => e);
  assert.ok(failure instanceof GenerationStageFailure);
  assert.equal(failure.stage, "summary");
  assert.equal(failure.schemaMissing, true);
  assert.equal(safeGenerationFailureLog(failure), '{"event":"conversation_generation_failed","stage":"summary","reason":"database_schema_missing"}');
  assert.doesNotMatch(safeGenerationFailureLog(failure), /SELECT|conversation_summaries/);
});
test("keeps known Gemini failures for their existing safe HTTP mapping", async () => {
  await assert.rejects(withGenerationStage("provider", async () => { throw new Error("gemini_provider_error:429"); }), /gemini_provider_error:429/);
});
test("does not leak unknown user/provider text", async () => {
  const e = await withGenerationStage("provider-settings", async () => { throw new Error("private@example.com key=secret"); }).catch(e => e);
  assert.ok(e instanceof GenerationStageFailure);
  assert.doesNotMatch(safeGenerationFailureLog(e), /private|secret|@/);
});
