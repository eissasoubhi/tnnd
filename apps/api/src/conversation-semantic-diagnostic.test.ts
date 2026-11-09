import assert from "node:assert/strict";
import test from "node:test";
import { publicObservedBoundaryFailure } from "./conversation-semantic-diagnostic.js";

test("unconfigured per-user Gemini credentials are not hidden behind a generic 503", () => {
  assert.equal(publicObservedBoundaryFailure(new Error("boundary_provider_not_configured")),
    "conversation_ai_provider_not_configured");
});

test("provider outage is actionable but does not expose upstream response", () => {
  assert.equal(publicObservedBoundaryFailure(new Error("boundary_classifier_unavailable")),
    "conversation_ai_provider_unavailable");
  for (const error of [new Error("Bearer secret-123"), new Error("DB query failed WHERE email=user@example.com"), null]) {
    const code = publicObservedBoundaryFailure(error);
    assert.equal(code, "conversation_semantic_check_unavailable");
    assert.doesNotMatch(code, /secret|user@example/);
  }
});
