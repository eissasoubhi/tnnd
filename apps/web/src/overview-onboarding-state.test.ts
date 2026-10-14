import assert from "node:assert/strict";
import test from "node:test";
import { isSetupComplete, shouldShowGuidedTour } from "./overview-onboarding-state";

test("only four verified essential steps count as completed", () => {
  assert.equal(isSetupComplete(null), false);
  assert.equal(isSetupComplete(75), false);
  assert.equal(isSetupComplete(100), true);
});

test("the first-run tour disappears after completed setup but can be reopened", () => {
  assert.equal(shouldShowGuidedTour({ dismissed: false, setupComplete: false, reopenedManually: false }), true);
  assert.equal(shouldShowGuidedTour({ dismissed: false, setupComplete: true, reopenedManually: false }), false);
  assert.equal(shouldShowGuidedTour({ dismissed: true, setupComplete: false, reopenedManually: false }), false);
  assert.equal(shouldShowGuidedTour({ dismissed: true, setupComplete: true, reopenedManually: true }), true);
});
