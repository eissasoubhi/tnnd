import assert from "node:assert/strict";
import test from "node:test";
import { humanActionBlocksConversation } from "./human-action-service.js";

test("human actions that require user intervention block conversation automation", () => {
  assert.equal(humanActionBlocksConversation("info"), false);
  assert.equal(humanActionBlocksConversation("action-required"), true);
  assert.equal(humanActionBlocksConversation("decision-required"), true);
  assert.equal(humanActionBlocksConversation("urgent"), true);
});
