import assert from "node:assert/strict";
import test from "node:test";
import { draftFailureGuidance } from "./draft-failure-guidance";
test("gives steps for known generation failures without exposing internal codes alone", () => {
  assert.match(draftFailureGuidance("gemini_not_configured"), /Settings/);
  assert.match(draftFailureGuidance("gemini_rate_limited"), /quota/);
  assert.match(draftFailureGuidance("internal_error",500), /API logs/);
  assert.match(draftFailureGuidance("network_error"), /Docker/);
  assert.match(draftFailureGuidance("something_unexpected",502), /API/);
});
