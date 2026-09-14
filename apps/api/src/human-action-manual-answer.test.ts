import assert from "node:assert/strict";
import test from "node:test";
import { MANUAL_ANSWER_MAX_LENGTH, parseManualAnswerInput } from "./human-action-manual-answer.js";

test("normalizes a bounded explicit user answer", () => {
  assert.deepEqual(parseManualAnswerInput({ actionId: " action-1 ", answer: "  I am free Friday evening.  " }), {
    actionId: "action-1",
    answer: "I am free Friday evening.",
    source: "user-manual-answer",
  });
});

test("rejects empty, oversized and unexpected input", () => {
  assert.throws(() => parseManualAnswerInput({ actionId: "a", answer: "   " }), /answer is required/);
  assert.throws(() => parseManualAnswerInput({ actionId: "a", answer: "x".repeat(MANUAL_ANSWER_MAX_LENGTH + 1) }), /exceeds/);
  assert.throws(() => parseManualAnswerInput({ actionId: "a", answer: "ok", pretendSent: true }), /unknown manual answer field/);
});
