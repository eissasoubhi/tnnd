import assert from "node:assert/strict";
import test from "node:test";
import { replyTargetFromHistory, replyTargetHint } from "./conversation-reply-target";
test("prefills exactly the latest received message", () => {
  assert.equal(replyTargetFromHistory([{direction:"outgoing",text:"Salut"},{direction:"incoming",text:" Hello " }]),"Hello");
});
test("does not reply to already answered or absent messages", () => {
  assert.equal(replyTargetFromHistory([{direction:"incoming",text:"Salut"},{direction:"outgoing",text:"Bonjour"}]),null);
  assert.equal(replyTargetFromHistory([]),null);
  assert.match(replyTargetHint([]), /Import visible chat/);
  assert.match(replyTargetHint([{direction:"outgoing",text:"OK"}]), /Your own message was last/);
});
