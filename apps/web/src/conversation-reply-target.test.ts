import assert from "node:assert/strict";
import test from "node:test";
import { replyTargetFromHistory, replyTargetHint } from "./conversation-reply-target";
test("prefills latest received message even when a later outgoing message exists", () => {
  const messages = [
    { direction:"incoming" as const, text:"Bonjour" },
    { direction:"outgoing" as const, text:"Salut" },
    { direction:"incoming" as const, text:" Tu habites où ? " },
    { direction:"outgoing" as const, text:"Paris !" }
  ];
  assert.equal(replyTargetFromHistory(messages),"Tu habites où ?");
  assert.match(replyTargetHint(messages), /manual preview only/);
  assert.match(replyTargetHint(messages), /do not send it again/);
});
test("prefills an unanswered latest incoming", () => {
  assert.equal(replyTargetFromHistory([{direction:"outgoing",text:"Salut"},{direction:"incoming",text:" Hello " }]),"Hello");
});
test("empty transcripts and only outgoing messages prompt re-import rather than a silent required field", () => {
  assert.equal(replyTargetFromHistory([{direction:"outgoing",text:"OK"}]),null);
  assert.equal(replyTargetFromHistory([]),null);
  assert.match(replyTargetHint([]), /Import visible chat/);
  assert.match(replyTargetHint([{direction:"outgoing",text:"OK"}]), /No received message/);
});
