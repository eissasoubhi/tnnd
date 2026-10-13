import assert from "node:assert/strict";
import test from "node:test";
import { prepareReadOnlyImport } from "../src/tinder-manual-import.ts";
const messages = [
  { key: "m1", direction: "them", text: "Salut !" },
  { key: "m2", direction: "me", text: "Hello !" }
];

test("new visible chat import stays paused and preserves direction", () => {
  const payload = prepareReadOnlyImport(messages, false, "2026-10-13T01:00:00Z");
  assert.equal(payload.requestedStatus, "paused");
  assert.equal(payload.nextCursor, "m2");
  assert.deepEqual(payload.messages.map(m => m.direction), ["incoming", "outgoing"]);
  assert.equal(payload.messages[0].text, "Salut !");
  assert.equal(payload.messages[0].sentAt, "2026-10-13T01:00:00.000Z");
  assert.equal(payload.messages[1].sentAt, "2026-10-13T01:00:00.001Z");
});
test("existing conversation status is preserved, without AI takeover", () => {
  const payload = prepareReadOnlyImport(messages, true, "2026-10-13T01:00:00Z");
  assert.equal(payload.requestedStatus, null);
  assert.equal(payload.messages.length, 2);
});
test("rejects ambiguous or invalid transcripts instead of uploading them", () => {
  assert.throws(() => prepareReadOnlyImport([], false, "2026-10-13T01:00:00Z"), /invalid_message_count/);
  assert.throws(() => prepareReadOnlyImport([{key:"",direction:"them",text:"Hi"}], false, "2026-10-13T01:00:00Z"), /invalid_visible_message/);
  assert.throws(() => prepareReadOnlyImport([{key:"x",direction:"unknown",text:"Hi"}], false, "2026-10-13T01:00:00Z"), /unknown_message_direction/);
  assert.throws(() => prepareReadOnlyImport([{key:"x",direction:"me",text:"Hi"}, {key:"x",direction:"them",text:"Hi"}], false, "2026-10-13T01:00:00Z"), /invalid_visible_message/);
});

test("imported timestamps preserve visible chat order instead of a random UUID tie", () => {
  const many = [
    { key: "alpha", direction: "me", text: "Hello" },
    { key: "beta", direction: "them", text: "Bonjour !" },
    { key: "gamma", direction: "them", text: "Ça va ?" }
  ];
  const parsed = prepareReadOnlyImport(many, false, "2026-10-13T10:15:00.000Z");
  assert.deepEqual([...parsed.messages].sort((a, b) => a.sentAt.localeCompare(b.sentAt)).map(x => x.text), many.map(x => x.text));
  assert.equal(parsed.nextCursor, "gamma");
});
