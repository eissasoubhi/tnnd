import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  messageChronologyGuidance, normalizeGreetingForCurrentTime
} from "../../../src/conversation-time-context.js";

const today = new Date("2026-10-28T08:15:00.000Z"); // Paris 09:15 CET
const messages = [
  { direction:"outgoing" as const, text:"Bonsoir, ça va ?", sentAt:"2026-10-27T19:00:00.000Z" },
  { direction:"incoming" as const, text:"Bonsoir ! Oui tranquille", sentAt:"2026-10-27T21:30:00.000Z" }
];
test("yesterday bonsoir becomes today's bonjour without misrepresenting earlier message time", () => {
  const guidance = messageChronologyGuidance({ currentCity:"Paris" }, messages, "Bonsoir ! Oui tranquille",today);
  assert.match(guidance,/Current moment: 2026-10-28 09:15 Europe\/Paris/);
  assert.match(guidance,/#1 outgoing 2026-10-27 20:00 \(Europe\/Paris/);
  assert.match(guidance,/#2 incoming 2026-10-27 22:30 \(Europe\/Paris/);
  assert.match(guidance,/Last verified outgoing: 2026-10-27 20:00/);
  assert.match(guidance,/Last verified incoming: 2026-10-27 22:30/);
  assert.match(guidance,/Current calendar date differs from latest incoming date: YES/);
  assert.match(guidance,/do NOT mirror 'bonsoir'/);
  assert.equal(normalizeGreetingForCurrentTime("Bonsoir, comment tu vas ?",{ currentCity:"Paris" },today),"Bonjour, comment tu vas ?");
  assert.equal(normalizeGreetingForCurrentTime("bonsoir !",{currentCity:"Paris"},today),"bonjour !");
});
test("evening correctly uses bonsoir and does not alter neutral salut or quoted text", () => {
  const now = new Date("2026-10-28T20:10:00Z"); // Paris 21:10
  assert.equal(normalizeGreetingForCurrentTime("Bonjour !",{residenceCity:"Paris"},now),"Bonsoir !");
  assert.equal(normalizeGreetingForCurrentTime("Salut, ça va ?",{currentCity:"Paris"},now),"Salut, ça va ?");
  assert.equal(normalizeGreetingForCurrentTime('Tu m’as dit "bonjour" hier',{currentCity:"Paris"},now),'Tu m’as dit "bonjour" hier');
  assert.equal(normalizeGreetingForCurrentTime("Bonjour, ça va ?",{currentCity:"Unknown"},now),"Bonjour, ça va ?");
});
test("crossing midnight depends on local timezone, including DST and Morocco", () => {
  const now = new Date("2026-03-29T07:30:00Z"); // France DST +2, Casablanca may differ
  const context = messageChronologyGuidance({currentCity:"Paris"},[
    {direction:"outgoing",text:"Salut",sentAt:"2026-03-28T22:30:00Z"},
    {direction:"incoming",text:"Bonsoir",sentAt:"2026-03-28T23:30:00Z"}
  ],"Bonsoir",now);
  assert.match(context,/Current moment: 2026-03-29 09:30 Europe\/Paris/);
  assert.match(context,/Current calendar date differs from latest incoming date: YES|Current calendar date differs from latest incoming date: NO/);
  assert.equal(normalizeGreetingForCurrentTime("Bonsoir",{currentCity:"Casa"},now),"Bonjour");
});
test("unknown location uses UTC reference and never guesses a timezone", () => {
  const guidance = messageChronologyGuidance({},messages,"Bonsoir ! Oui tranquille",today);
  assert.match(guidance,/UTC reference ONLY; user's local timezone unknown/);
  assert.match(guidance,/Prefer time-neutral greetings/);
  assert.equal(normalizeGreetingForCurrentTime("Bonsoir",{},today),"Bonsoir");
});
test("missing, inconsistent, future timestamps and stale synchronized last turn fail safe", () => {
  assert.equal(messageChronologyGuidance({currentCity:"Paris"},messages,"unseen Tinder bubble",today),"");
  assert.equal(messageChronologyGuidance({currentCity:"Paris"},[{...messages[0],direction:"incoming"}],"Bonsoir, ça va ?",today),"");
  assert.equal(messageChronologyGuidance({currentCity:"Paris"},[{...messages[0],sentAt:"n/a"},{...messages[1],sentAt:"n/a"}],"Bonsoir ! Oui tranquille",today),"");
  assert.equal(messageChronologyGuidance({currentCity:"Paris"},[{...messages[0],sentAt:"2026-10-29T10:00:00Z"},messages[1]],"Bonsoir ! Oui tranquille",today),"");
  const partial=messageChronologyGuidance({currentCity:"Paris"},[
    {...messages[0],sentAt:"not-a-date"},messages[1]
  ],"Bonsoir ! Oui tranquille",today);
  assert.match(partial,/1 message timestamp\(s\) missing, invalid or out of order/);
  assert.doesNotMatch(partial,/#1 outgoing/);
});
test("timestamp metadata never duplicates raw private Tinder messages or marks a sent message", () => {
  const context=messageChronologyGuidance({currentCity:"Paris"},[
    {direction:"outgoing",text:"secret private number 0123456",sentAt:messages[0].sentAt},
    {...messages[1],text:"private incoming message"}],"private incoming message",today);
  assert.doesNotMatch(context,/secret private number|private incoming message/);
  assert.doesNotMatch(context,/verified sent|delivery confirmed/);
});
test("both API/Web and extension Gemini generation consume shared chronology and normalize generated greetings", async () => {
  const [manual,automatic] = await Promise.all([
    readFile(new URL("./conversation-generation-service.ts",import.meta.url),"utf8"),
    readFile(new URL("./extension-suggestions.ts",import.meta.url),"utf8")
  ]);
  for (const source of [manual,automatic]) {
    assert.match(source,/messageChronologyGuidance\(/);
    assert.match(source,/normalizeGreetingForCurrentTime\(/);
  }
  assert.match(manual,/conversation\.messages, normalizedMessage/);
  assert.match(automatic,/observedMessages\.at\(-1\).*direction === "incoming"/);
});
