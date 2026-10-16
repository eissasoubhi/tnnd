import assert from "node:assert/strict";
import test from "node:test";
import { inferConversationSemanticTags as infer } from "./conversation-semantic-tags.js";

const history = (...messages: Array<["incoming" | "outgoing", string]>) =>
  messages.map(([direction, text]) => ({ direction, text }));

test("unsynced conversations are unknown, not incorrectly marked introductions", () => {
  assert.deepEqual(infer([]), { stage: null, tone: null, source: "unknown" });
});
test("repeated greetings never imply dating progress", () => {
  const result = infer(history(
    ["outgoing","Salut"],["incoming","Hey"],["outgoing","Coucou"],["incoming","Bonsoir"],
    ["outgoing","Bonjour"],["incoming","Salut"]
  ));
  assert.equal(result.stage,"introductions");
  assert.equal(result.tone,null);
});
test("substantive two-way interests indicate getting to know, not just total length", () => {
  const result = infer(history(
    ["outgoing","Tu aimes voyager en été ?"],["incoming","J'aime bien la montagne et le sport"]
  ));
  assert.equal(result.stage,"getting-to-know");
  assert.equal(result.tone,null);
});
test("an explicit meeting discussion is not presented as a confirmed date", () => {
  const result = infer(history(
    ["outgoing","On se voit demain soir ?"],["incoming","Je ne sais pas encore"]
  ));
  assert.equal(result.stage,"date-discussion");
});
test("overt flirting and reciprocal laughter provide different tone signals", () => {
  assert.equal(infer(history(["incoming","Tu me plais"],["outgoing","Coucou"])).tone,"flirty");
  assert.equal(infer(history(["outgoing","Haha t'as vu"],["incoming","Hhh mdr"])).tone,"playful");
  assert.equal(infer(history(["outgoing","haha"],["incoming","oui"])).tone,null);
  assert.equal(infer(history(["outgoing","Bon courage pour demain"],["incoming","merci"])).tone,"warm");
});
test("handoff status tags off-Tinder without exposing content or guessing tone", () => {
  const result = infer(history(["incoming","hey"]),"moved-off-tinder");
  assert.deepEqual(result,{stage:"off-tinder",tone:null,source:"rule-based"});
});
