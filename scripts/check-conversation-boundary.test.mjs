import assert from "node:assert/strict";
import test from "node:test";
import { classifyConversationBoundary as classify } from "../src/conversation-boundary-policy.ts";

const exchange = (...messages) => messages.map(([direction, text]) => ({ direction, text }));

test("mutual farewell ends for now without another goodbye", () => {
  assert.equal(classify(exchange(["outgoing", "Bonne soirée !"], ["incoming", "Bye 🙂"])).kind, "rest");
  assert.equal(classify(exchange(["outgoing", "Good night"], ["incoming", "You too"])).kind, "continue");
  assert.equal(classify(exchange(["outgoing", "Good night"], ["incoming", "ok"])).kind, "rest");
  assert.equal(classify(exchange(["outgoing", "تصبح على خير"], ["incoming", "بسلامة"])).kind, "rest");
});

test("an unmatched goodbye may receive one polite closing reply", () => {
  assert.equal(classify(exchange(["outgoing", "How was your day?"], ["incoming", "Bonne nuit"])).kind, "continue");
  assert.equal(classify(exchange(["incoming", "bye"])).kind, "continue");
});

test("explicitly agreed app handoff stops Tinder replies", () => {
  assert.deepEqual(classify(exchange(["outgoing", "On passe sur Insta ?"], ["incoming", "D'accord"])), {kind:"off-tinder",platform:"instagram"});
  assert.deepEqual(classify(exchange(["outgoing", "Let's talk on WhatsApp"], ["incoming", "OK"])), {kind:"off-tinder",platform:"whatsapp"});
  assert.deepEqual(classify(exchange(["incoming", "Écris-moi sur Instagram plutôt"])), {kind:"off-tinder",platform:"instagram"});
});

test("contact discovery and generic assent never establish a handoff", () => {
  assert.equal(classify(exchange(["outgoing", "Tu as Instagram ?"], ["incoming", "@lola_03"])).kind, "continue");
  assert.equal(classify(exchange(["outgoing", "Coucou"], ["incoming", "ok"])).kind, "continue");
  assert.equal(classify(exchange(["outgoing", "On passe sur Insta ?"], ["incoming", "Non je préfère ici"])).kind, "continue");
});

test("new message after a closed exchange may be handled again", () => {
  const messages = exchange(["outgoing", "Bonne soirée"], ["incoming", "bye"], ["incoming", "Salut ça va ?"]);
  assert.equal(classify(messages).kind, "continue");
});

test("clear request not to contact overrides all other policy", () => {
  assert.equal(classify(exchange(["incoming", "Don't message me again"])).kind, "do-not-contact");
});

test("never act on outgoing-only, empty, or unknown direction evidence", () => {
  assert.equal(classify(exchange(["outgoing", "Bye"])).kind, "continue");
  assert.equal(classify([]).kind, "continue");
  assert.equal(classify([{ direction: "unknown", text: "bye" }]).kind, "continue");
});
