import test from "node:test";
import assert from "node:assert/strict";
import { resolveAdaptiveStyle } from "./conversation-style-adaptation.js";

test("auto adapts five fields per conversation without persisting", () => {
  const incoming = [{ direction: "incoming" as const, text: "Haha 😂 what happened?!" }, { direction: "incoming" as const, text: "lol 😂 tell me more?" }];
  const original = {};
  const result = resolveAdaptiveStyle(original, {}, incoming, "That is hilarious 😂?");
  assert.equal(result.settings.messageLength, "very-short");
  assert.equal(result.settings.directness, 65);
  assert.equal(result.settings.teasingStyle, "playful");
  assert.equal(result.settings.humorLevel, 70);
  assert.equal(result.settings.doubleTexting, "sometimes");
  assert.equal(result.autoFields.length, 5);
  assert.deepEqual(original, {});
});
test("manual chat and global values override auto, including numeric zero", () => {
  const result = resolveAdaptiveStyle(
    { messageLength: "medium", directness: 0, humorLevel: 0, teasingStyle: "none", doubleTexting: "avoid" },
    { messageLength: "auto-adaptive", humorStyle: "auto-adaptive" },
    [{ direction: "incoming", text: "😂😂 lol" }], "haha"
  );
  assert.deepEqual(result.autoFields, []);
  assert.equal(result.settings.directness, 0);
  assert.equal(result.settings.humorLevel, 0);
});
test("global manual legacy preferences are retained, but default is auto", () => {
  const result = resolveAdaptiveStyle({}, { messageLength: "short", directness: "very-direct", teasingStyle: "light", humorStyle: "witty", doubleTexting: "comfortable" }, [], "hello");
  assert.deepEqual(result.settings, { messageLength: "short", directness: 90, teasingStyle: "light", humorLevel: 65, doubleTexting: "comfortable" });
  assert.equal(result.autoFields.length, 0);
  const empty = resolveAdaptiveStyle({}, {}, [], "");
  assert.deepEqual(empty.autoFields, ["messageLength", "directness", "teasingStyle", "humorLevel", "doubleTexting"]);
});
test("longer calm conversation is medium and not forcibly playful", () => {
  const long = "I'd like to hear more about your week, and maybe catch up when we have enough time to talk in a relaxed way. That sounds nice, what do you think about it?";
  const r = resolveAdaptiveStyle({}, {}, [{ direction: "incoming", text: long }], long);
  assert.equal(r.settings.messageLength, "medium");
  assert.equal(r.settings.teasingStyle, "none");
  assert.equal(r.settings.doubleTexting, "avoid");
});
