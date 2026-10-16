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

test("a French message ending in hhh invites attention to its playful meaning, not a Darija switch", () => {
  const context = "Me: Tu explores différents cafés ?\nThem: Je teste plein d'endroits mais je reste fidèle à mon café préféré hhh";
  const cues = readReplyStyleCues(readLabeledReplyHistory(context));
  assert.equal(cues.recentLanguage, "fr");
  assert.equal(cues.latestIncomingLaughter, true);
  const guidance = replyStyleGuidance(cues);
  assert.match(guidance, /hhh.*small 'haha'/);
  assert.match(guidance, /playful contrast, witty wording, teasing remark or metaphor/);
  assert.match(guidance, /before optionally asking a relevant follow-up/);
  assert.match(guidance, /not an invitation to copy the laugh|NOT an invitation to copy the laugh/);
  assert.doesNotMatch(guidance, /Prefer natural Latin-script Darija/);
});

test("the match's hhh is a tone cue, not a reason to force an outgoing laugh or flirt", () => {
  const cues = readReplyStyleCues(readLabeledReplyHistory(
    "Me: haha oui\nThem: Mon adresse préférée reste la même hhh"
  ));
  assert.equal(cues.latestIncomingLaughter, true);
  assert.equal(cues.repeatedSenderLaughter, true);
  assert.match(replyStyleGuidance(cues), /Never tease about a sensitive matter or invent mutual attraction/);
  assert.equal(limitReplyLaughter("Ah donc tu es fidèle à une adresse haha ?", cues),
    "Ah donc tu es fidèle à une adresse ?");
});

test("an older match laugh does not carry over when the latest turn is serious or outgoing", () => {
  const history = readLabeledReplyHistory("Them: trop drôle hhh\nThem: j'ai eu une journée difficile");
  assert.equal(readReplyStyleCues(history).latestIncomingLaughter, false);
  assert.doesNotMatch(replyStyleGuidance(readReplyStyleCues(history)), /The match's current message contains a laugh cue/);
  const sentLast = readLabeledReplyHistory("Them: oui hhh\nMe: d'accord");
  assert.equal(readReplyStyleCues(sentLast).latestIncomingLaughter, false);
});
