import assert from "node:assert/strict";
import test from "node:test";
import {
  humanActionBlocksConversation,
  mergeManualAnswerContext,
  shouldReleaseHumanActionPause
} from "./human-action-service.js";

test("human actions that require user intervention block conversation automation", () => {
  assert.equal(humanActionBlocksConversation("info"), false);
  assert.equal(humanActionBlocksConversation("action-required"), true);
  assert.equal(humanActionBlocksConversation("decision-required"), true);
  assert.equal(humanActionBlocksConversation("urgent"), true);
});

test("conversation resumes only after the final blocking action is resolved", () => {
  assert.equal(shouldReleaseHumanActionPause(true), false);
  assert.equal(shouldReleaseHumanActionPause(false), true);
});

test("manual answer context is explicit that no external delivery happened", () => {
  const context = mergeManualAnswerContext(
    { reason: "availability" },
    { actionId: "action-1", answer: "Friday evening works.", source: "user-manual-answer" },
    "2026-01-01T12:00:00.000Z"
  );
  assert.deepEqual(context, {
    reason: "availability",
    manualAnswer: {
      answer: "Friday evening works.",
      source: "user-manual-answer",
      providedAt: "2026-01-01T12:00:00.000Z",
      deliveryState: "not-sent"
    }
  });
});
