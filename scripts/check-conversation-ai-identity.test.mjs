import assert from "node:assert/strict";
import test from "node:test";
import {
  isDirectAiIdentityQuestion as asks,
  latestIncomingAsksAboutAiIdentity as latest
} from "../src/conversation-ai-identity-question.ts";

test("direct questions in Moroccan Darija Latin script trigger human review", () => {
  for (const phrase of ["Nta iA", "Nta Rak iA", "wach nta AI?", "nti bot", "Rak ChatGPT", "nta katjawb b chatgpt"]) {
    assert.equal(asks(phrase), true, phrase);
  }
});
test("French English and Arabic direct questions trigger human review", () => {
  for (const phrase of ["T'es une IA ?", "Tu es un robot ?", "Vous êtes une IA", "Are you a bot?", "You're an AI", "هل انت روبوت", "واش نتا ذكاء اصطناعي"]) {
    assert.equal(asks(phrase), true, phrase);
  }
});
test("unrelated discussion of tech is never mistaken for direct accusation", () => {
  for (const phrase of [
    "Je travaille dans l'IA", "Tu travailles dans l'IA ?",
    "Tu connais ChatGPT ?", "Do you work in AI?", "I like robots",
    "nta dial casa", "rak mzyan", "ChatGPT peut aider", "Je suis dev IA",
    "What do you think of AI?", "Ntaya m3aya?"
  ]) assert.equal(asks(phrase), false, phrase);
});
test("only the latest VERIFIED incoming bubble determines automatic stop", () => {
  assert.equal(latest([{direction:"incoming",text:"nta ia"}]), true);
  assert.equal(latest([{direction:"incoming",text:"nta ia"}, {direction:"outgoing",text:"merci"}]), false);
  assert.equal(latest([{direction:"incoming",text:"nta ia"}, {direction:"incoming",text:"safi"}]), false);
  assert.equal(latest([{direction:"outgoing",text:"nta ia"}]), false);
  assert.equal(latest([]), false);
});
