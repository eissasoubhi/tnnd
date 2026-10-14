import assert from "node:assert/strict";
import test from "node:test";
import { detectMatchLanguage, limitReplyLaughter, readLabeledReplyHistory, readReplyStyleCues, replyStyleGuidance } from "../../../src/conversation-reply-style.js";

test("recent Latin-script Moroccan Darija can take priority after French exchanges", () => {
  const messages = readLabeledReplyHistory("Them: durant la semaine c juste la routine\nMe: tu fais quoi en weekend ?\nThem: oui wakha kaydouz mzyan hhh");
  const cues = readReplyStyleCues(messages);
  assert.equal(cues.recentLanguage, "darija");
  assert.match(replyStyleGuidance(cues), /Prefer natural Latin-script Darija/);
  assert.equal(detectMatchLanguage("oui wakha kaydouz mzyan hhh"), "darija");
  assert.equal(detectMatchLanguage("durant la semaine c juste la routine"), "fr");
});

test("isolated loanwords or short ambiguous answers do not trigger language switching", () => {
  assert.equal(detectMatchLanguage("oui bzf"), "unknown");
  assert.equal(detectMatchLanguage("hhh"), "unknown");
  assert.equal(readReplyStyleCues(readLabeledReplyHistory("Them: oui bzf")).recentLanguage, "unknown");
  assert.match(replyStyleGuidance(readReplyStyleCues([])), /keep the saved language baseline/);
  assert.match(replyStyleGuidance(readReplyStyleCues([]), false), /fixed or manually overridden/);
});

test("the match's language does not come from the sender's outgoing text", () => {
  const cues = readReplyStyleCues(readLabeledReplyHistory("Me: hello how are you doing today\nThem: oui je suis bien aujourd'hui"));
  assert.equal(cues.recentLanguage, "fr");
});

test("recent outgoing laugh fillers are not echoed even if the match writes hhh", () => {
  const messages = readLabeledReplyHistory("Me: haha tu fais quoi\nThem: je travaille\nMe: grave haha\nThem: wakha kaydouz mzyan hhh");
  const cues = readReplyStyleCues(messages);
  assert.equal(cues.recentOutgoingLaughter, 2);
  assert.match(replyStyleGuidance(cues), /Do NOT put any laugh token/);
  assert.equal(limitReplyLaughter("grave haha, et toi hhh ?", cues), "grave, et toi ?");
  assert.equal(limitReplyLaughter("haha ça va", cues), "ça va");
  assert.equal(limitReplyLaughter("rien de spécial", cues), "rien de spécial");
});

test("one natural laugh is allowed with no recent filler, while repeated fillers are removed", () => {
  const cues = readReplyStyleCues(readLabeledReplyHistory("Them: trop drôle !"));
  assert.equal(cues.repeatedSenderLaughter, false);
  assert.equal(limitReplyLaughter("haha c'est marrant haha", cues), "haha c'est marrant");
  assert.equal(limitReplyLaughter("une première ligne\nune deuxième ligne", cues), "une première ligne\nune deuxième ligne");
});
