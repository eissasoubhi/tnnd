import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticReplyHold,
  hasUnexpectedScriptMix,
  replyNeedsHumanReview
} from "../src/conversation-reply-safety.ts";

const turns = (...rows) => rows.map(([direction, text]) => ({ direction, text }));

test("unresolved AI suspicion survives consecutive incoming short messages", () => {
  assert.equal(automaticReplyHold(turns(
    ["outgoing","Tu aimes les rooftops ?"],
    ["incoming","Mais là j'ai l'impression de parler à une IA"],
    ["incoming","Jnsp pq"],
    ["incoming","Hhh"]
  )), "ai-identity");
  assert.equal(automaticReplyHold(turns(
    ["incoming","Nta IA"],
    ["outgoing","Oui, j'utilise une assistance"],
    ["incoming","C'est quel resto ?"]
  )), null);
});

test("plain acknowledgements and end-of-turn OK do not receive one more AI bubble", () => {
  for (const text of ["Ok ca marche", "OK ça marche", "Hhh ok", "D'accord", "Merci", "Got it"]) {
    assert.equal(automaticReplyHold(turns(["outgoing","je vois"],["incoming",text])), "acknowledgement", text);
  }
  for (const text of ["Ok ça marche, et demain ?", "Je vais bien", "Ghi raha", "Hhh oui je voulais te dire un truc"]) {
    assert.equal(automaticReplyHold(turns(["outgoing","salut"],["incoming",text])), null, text);
  }
  assert.equal(automaticReplyHold(turns(["incoming","Ok ça marche"],["outgoing","à demain"])), null);
});

test("automated false denials of AI involvement need human review", () => {
  assert.equal(replyNeedsHumanReview("je suis bien réel t'inquiète"), true);
  assert.equal(replyNeedsHumanReview("Je suis pas une IA"), true);
  assert.equal(replyNeedsHumanReview("I'm not a bot"), true);
  assert.equal(replyNeedsHumanReview("Je peux t'expliquer comment j'utilise l'IA"), false);
  assert.equal(replyNeedsHumanReview("tu peux me parler directement"), false);
});

test("keep Moroccan Latin-script Darija consistent, without blocking unrelated script", () => {
  const latin = turns(["outgoing","Chno katdiri?"],["incoming","Ghi raha"]);
  assert.equal(hasUnexpectedScriptMix("ah أحسن حاجة، شي فيلم زوين ولا والو؟",latin), true);
  assert.equal(hasUnexpectedScriptMix("Haniya, rta7i mzyan",latin), false);
  assert.equal(hasUnexpectedScriptMix("أحسن حاجة ترتاحي",latin), false);
  assert.equal(hasUnexpectedScriptMix("Ah ça va bien ?",turns(["incoming","Oui, tranquille"])),false);
  assert.equal(hasUnexpectedScriptMix("ah أحسن حاجة",turns(["incoming","دارجة mzyana"])),false);
});
