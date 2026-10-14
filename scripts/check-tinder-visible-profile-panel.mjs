import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readVisibleTinderProfilePanel } from "../src/tinder-visible-profile-panel.ts";

class FakeElement {
  constructor(value = "", map = {}) {
    this.innerText = value;
    this.textContent = value;
    this.map = map;
    this.offsetParent = {};
    this.nextElementSibling = null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) { return this.map[selector] ?? []; }
  closest(selector) { return selector === ".chatProfile" ? this : null; }
}
// The extractor runs in the content script where HTMLElement exists; synthetic
// JS fixtures make sure it never depends on a user's private Tinder DOM.
globalThis.HTMLElement = FakeElement;
const el = value => new FakeElement(value);
function card(title, attributes = {}) {
  const heading = el(title), map = { h2: [heading], ...attributes };
  const c = new FakeElement(title, map);
  return c;
}
function fixture(name = "Mina 24") {
  const looking = card("Looking for", { "p, li, [data-testid]": [el("Long-term partner")] });
  const about = card("About me", { "p, li, [data-testid]": [el("I like traveling and movies")] });
  const essentials = card("Essentials");
  essentials.innerText = "Essentials\n169 cm\n100 km away";
  const interests = card("Interests", { "ul > li": [el("Travel"), el("Movies")] });
  const question = el("Weekends are for...");
  const answer = el("Resting");
  question.nextElementSibling = answer;
  const item = new FakeElement("", { h3: [question] });
  const weekend = card("My Weekends", { "ul > li": [item] });
  const root = new FakeElement("", {
    h1: [el(name)],
    ".profileCard__card": [looking, about, essentials, interests, weekend]
  });
  const document = { querySelector(selector) {
    return selector === "aside .chatProfile .profileContent" ? root : null;
  }};
  return { document, root };
}

test("captures separate right-side Tinder cards, lifestyle prompt, and verified height", () => {
  const { document } = fixture();
  const capture = readVisibleTinderProfilePanel(
    "match-1", { firstName: "Mina", age: 24 }, document, "/app/messages/match-1"
  );
  assert.equal(capture?.firstName, "Mina");
  assert.equal(capture?.relationshipGoal, "Long-term partner");
  assert.equal(capture?.bio, "I like traveling and movies");
  assert.equal(capture?.heightCm, 169);
  assert.deepEqual(capture?.interests, ["Travel", "Movies"]);
  assert.deepEqual(capture?.prompts, [
    { section: "My Weekends", question: "Weekends are for...", answer: "Resting" }
  ]);
  assert.equal(capture?.location, undefined, "distance is not a verified location");
});
test("fails closed on wrong thread, mismatch, hidden profile, or missing DOM", () => {
  const { document, root } = fixture();
  const identity = { firstName: "Mina", age: 24 };
  assert.equal(readVisibleTinderProfilePanel("match-1", identity, document, "/app/messages/other"), null);
  assert.equal(readVisibleTinderProfilePanel("match-1", { firstName: "Amina", age: 24 }, document, "/app/messages/match-1"), null);
  assert.equal(readVisibleTinderProfilePanel("match-1", { firstName: "Mina", age: 27 }, document, "/app/messages/match-1"), null);
  root.offsetParent = null;
  assert.equal(readVisibleTinderProfilePanel("match-1", identity, document, "/app/messages/match-1"), null);
  assert.equal(readVisibleTinderProfilePanel("match-1", identity, { querySelector: () => null }, "/app/messages/match-1"), null);
});
test("capture uses the existing authenticated backend sync; Web shows the saved profile", async () => {
  const read = async path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const [content, background, apiContract, apiStore, web] = await Promise.all([
    "src/content.ts", "src/background.ts", "apps/api/src/match-profile-contract.ts",
    "apps/api/src/match-profile-service.ts", "apps/web/src/conversation-panel.ts"
  ].map(read));
  assert.match(content, /readVisibleTinderProfilePanel\(ref, identity\)/);
  assert.match(content, /TNND_SYNC_VISIBLE_MATCH_IDENTITY/);
  assert.match(background, /verified && observed \? \{/);
  assert.match(background, /prompts: observed\.prompts/);
  assert.match(apiContract, /prompts\?: Array/);
  assert.match(apiStore, /jsonb_set\(EXCLUDED\.source_capture/);
  assert.match(apiStore, /COALESCE\(match_profiles\.normalized_profile->'fields'/);
  assert.match(web, /mountConversationMatchProfile\(profileHost, session, conversationId\)/);
});
