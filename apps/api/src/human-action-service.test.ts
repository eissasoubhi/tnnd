import assert from "node:assert/strict";
import test from "node:test";
import {
  humanActionBlocksConversation,
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
