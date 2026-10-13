import assert from "node:assert/strict";
import test from "node:test";
import { resolveReplyTarget } from "./conversation-reply-target.js";
test("server generates from last received message without required manual form field", () => {
  assert.equal(resolveReplyTarget(undefined, [
    { direction: "incoming", text: "Salut" },
    { direction: "outgoing", text: "Coucou" },
    { direction: "incoming", text: "Ça va ?" }
  ]), "Ça va ?");
});
test("manual previews remain possible without changing saved history", () => {
  assert.equal(resolveReplyTarget(" Different preview ", [{direction:"incoming",text:"Hi"}]),"Different preview");
});
test("outgoing only or absent messages cannot be mistaken for a match reply", () => {
  assert.throws(() => resolveReplyTarget("", [{direction:"outgoing",text:"Bonjour"}]), /no_synced_incoming_message/);
  assert.throws(() => resolveReplyTarget(undefined, []), /no_synced_incoming_message/);
});
