import assert from "node:assert/strict";
import test from "node:test";
import { longGapConversationGuidance, LONG_GAP_REENTRY_MS } from "../../../src/conversation-long-gap.js";
import { readFile } from "node:fs/promises";

const now = new Date("2026-10-28T19:00:00.000Z");
const at = (offsetHours: number) => new Date(now.getTime() - offsetHours * 3_600_000).toISOString();
const oldQuestion = [
  { direction: "outgoing" as const, text: "Tu habites où ?", sentAt: at(76) },
  { direction: "incoming" as const, text: "À Salé, et toi ?", sentAt: at(74) }
];

test("after 48h of verified inactivity, first message is a brief greeting/check-in, not a rushed old answer", () => {
  const actual = longGapConversationGuidance(oldQuestion, "À Salé, et toi ?", now);
  assert.match(actual, /Long-gap conversation RE-ENTRY/);
  assert.match(actual, /Bonsoir, comment tu vas/);
  assert.match(actual, /Do not immediately answer an old non-urgent question/);
  assert.match(actual, /Send only the one ordinary allowed reply/);
});

test("a brand-new incoming message after two quiet days also starts with a short check-in", () => {
  const messages = [
    { direction: "outgoing" as const, text: "Bonne soirée !", sentAt: at(100) },
    { direction: "incoming" as const, text: "Tu fais quoi ?", sentAt: at(1) }
  ];
  const first = longGapConversationGuidance(messages, "Tu fais quoi ?", now);
  assert.match(first, /RE-ENTRY/);
  const next = longGapConversationGuidance([
    ...messages,
    { direction: "outgoing" as const, text: "Salut, comment tu vas ?", sentAt: at(0.8) },
    { direction: "incoming" as const, text: "Bien et toi ?", sentAt: at(0.4) }
  ], "Bien et toi ?", now);
  assert.match(next, /earlier unanswered question/);
  assert.doesNotMatch(next, /RE-ENTRY/);
});

test("threshold is exactly 48h and prompt is silent before that", () => {
  assert.equal(LONG_GAP_REENTRY_MS, 172_800_000);
  assert.equal(longGapConversationGuidance([
    { direction: "outgoing", text: "Salut", sentAt: at(49) },
    { direction: "incoming", text: "Hello", sentAt: at(47.99) }
  ], "Hello", now), "");
  assert.match(longGapConversationGuidance([
    { direction: "outgoing", text: "Salut", sentAt: at(50) },
    { direction: "incoming", text: "Hello", sentAt: at(48) }
  ], "Hello", now), /RE-ENTRY/);
});

test("no guessed gap with missing/future/unsorted timestamps, a different Tinder turn or last outgoing", () => {
  for (const data of [
    [{ direction: "outgoing", text: "Salut" }, { direction: "incoming", text: "Hello", sentAt: at(60) }],
    [{ direction: "outgoing", text: "Salut", sentAt: at(80) }, { direction: "incoming", text: "Hello" }],
    [{ direction: "outgoing", text: "Salut", sentAt: at(70) }, { direction: "incoming", text: "Hello", sentAt: at(-1) }],
    [{ direction: "outgoing", text: "Salut", sentAt: at(2) }, { direction: "incoming", text: "Hello", sentAt: at(70) }],
    [{ direction: "incoming", text: "Hello", sentAt: at(70) }, { direction: "outgoing", text: "Salut", sentAt: at(65) }]
  ] as Array<Array<{direction:"incoming"|"outgoing";text:string;sentAt?:string}>>) {
    assert.equal(longGapConversationGuidance(data, null, now), "");
  }
  assert.equal(longGapConversationGuidance(oldQuestion, "Un nouveau message non synchronisé", now), "");
  assert.equal(longGapConversationGuidance([{ direction:"incoming", text:"Salut", sentAt: at(80)}], "Salut", now), "");
});

test("boundaries and sensitive issues override a generic restart greeting", () => {
  for (const text of ["Stop", "Ne m'écris plus", "Not interested", "C'est urgent", "Je suis à l'hôpital"]) {
    const history = [oldQuestion[0], { direction: "incoming" as const, text, sentAt: at(74) }];
    assert.equal(longGapConversationGuidance(history, text, now), "", text);
  }
});

test("after match answers resumed greeting, do not greet again; return to an unanswered old question if relevant", () => {
  const history = [
    ...oldQuestion,
    { direction: "outgoing" as const, text: "Salut, comment tu vas ?", sentAt: at(2) },
    { direction: "incoming" as const, text: "Ça va, et toi ?", sentAt: at(0.5) }
  ];
  const actual = longGapConversationGuidance(history, "Ça va, et toi ?", now);
  assert.match(actual, /earlier unanswered question/);
  assert.match(actual, /Do not greet them again/);
  assert.doesNotMatch(actual, /Long-gap conversation RE-ENTRY/);
  assert.equal(longGapConversationGuidance([
    ...history, { direction: "outgoing", text: "Tranquille, moi aussi", sentAt: at(0.3) },
    { direction: "incoming", text: "Cool", sentAt: at(0.2) }
  ], "Cool", now), "");
});

test("match replying days after the check-in must not trigger another greeting", () => {
  const history = [
    { direction: "outgoing" as const, text: "Je suis de Paris", sentAt: at(175) },
    { direction: "incoming" as const, text: "Ah et tu travailles où ?", sentAt: at(174) },
    { direction: "outgoing" as const, text: "Salut, ça va ?", sentAt: at(120) },
    { direction: "incoming" as const, text: "Oui merci et toi ?", sentAt: at(1) }
  ];
  const actual = longGapConversationGuidance(history, "Oui merci et toi ?", now);
  assert.match(actual, /earlier unanswered question/);
  assert.match(actual, /Do not greet them again/);
  assert.doesNotMatch(actual, /RE-ENTRY/);
});

test("fresh follow-up after an older non-question gently starts a new topic instead", () => {
  const history = [
    { direction: "outgoing" as const, text: "À bientôt", sentAt: at(75) },
    { direction: "incoming" as const, text: "OK", sentAt: at(74) },
    { direction: "outgoing" as const, text: "Bonsoir, ça va ?", sentAt: at(3) },
    { direction: "incoming" as const, text: "Bien merci", sentAt: at(1) }
  ];
  const actual = longGapConversationGuidance(history, "Bien merci", now);
  assert.match(actual, /No verified pending old question/);
  assert.match(actual, /start a fresh topic only if/);
});

test("both server manual drafts and extension auto generations use the shared verified rule", async () => {
  const [server, extension] = await Promise.all([
    readFile(new URL("./conversation-generation-service.ts", import.meta.url), "utf8"),
    readFile(new URL("./extension-suggestions.ts", import.meta.url), "utf8")
  ]);
  assert.match(server, /longGapConversationGuidance\(conversation\.messages, normalizedMessage\)/);
  assert.match(extension, /longGapConversationGuidance\(storedConversation\.messages/);
  assert.match(extension, /request\.purpose !== "opener"/);
  assert.match(extension, /observedMessages\.at\(-1\)/);
});
