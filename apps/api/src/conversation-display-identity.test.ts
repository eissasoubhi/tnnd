import assert from "node:assert/strict";
import test from "node:test";
import { conversationDisplayName, matchIdentity } from "./conversation-display-identity.js";
test("only a recorded first name replaces the opaque conversation ID", () => {
  assert.equal(conversationDisplayName("c123456789", "Sara"), "Sara");
  assert.equal(conversationDisplayName("c123456789", null), "Conversation c1234567");
  assert.equal(conversationDisplayName("c123456789", " "), "Conversation c1234567");
});
test("age is validated and never invented", () => {
  assert.deepEqual(matchIdentity(" Sara ", "28"), {name:"Sara", age:28});
  assert.equal(matchIdentity("Sara", "invalid").age, null);
  assert.equal(matchIdentity("Sara", "14").age, null);
});
