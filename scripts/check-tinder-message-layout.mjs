import assert from "node:assert/strict";
import test from "node:test";
import { directionFromChatColumnGeometry, directionFromVerifiedTinderClasses, messageBubbleSized } from "../src/tinder-message-layout.ts";
import { directionFromTinderHints } from "../src/tinder-message-evidence.ts";
import { unansweredStatus } from "../src/tinder-unanswered-backlog.ts";
import { isTinderMessageUiControl, NON_MESSAGE_UI_CONTROL_SELECTOR } from "../src/tinder-message-candidate-filter.ts";

const composer = {left: 80, right: 900, width: 820};
const bubble = (left, right) => ({left, right, width: right-left});

test("Srim-like avatar-side messages left of the Tinder chat composer are incoming", () => {
  const messages = [
    { direction: directionFromChatColumnGeometry(bubble(145,370), composer), text:"Lhamdolilah et toi" },
    { direction: directionFromChatColumnGeometry(bubble(150,250), composer), text:"Rabat" },
    { direction: directionFromChatColumnGeometry(bubble(150,211), composer), text:"Toi?" }
  ];
  assert.deepEqual(messages.map(m => m.direction),["them","them","them"]);
  assert.equal(unansweredStatus(messages),"unanswered");
});

test("right-aligned messages are from me, and already-replied does not trigger catch-up", () => {
  const messages = [
    { direction: directionFromChatColumnGeometry(bubble(125,300),composer), text: "Salut" },
    { direction: directionFromChatColumnGeometry(bubble(695,860),composer), text:"Ça va, merci" }
  ];
  assert.deepEqual(messages.map(x => x.direction),["them","me"]);
  assert.equal(unansweredStatus(messages),"already-replied");
});

test("full-width row or centered message MUST remain unknown rather than guessing outgoing", () => {
  assert.equal(messageBubbleSized(bubble(80,900), composer),false);
  assert.equal(directionFromChatColumnGeometry(bubble(80,900),composer),"unknown");
  assert.equal(directionFromChatColumnGeometry(bubble(450,540),composer),"unknown");
  assert.equal(directionFromChatColumnGeometry(bubble(1010,1095),composer),"unknown");
  assert.equal(unansweredStatus([{direction: "unknown", text: "Toi?"}]),"unrecognized-direction");
});

test("explicit Tinder directional tokens still take precedence over visual estimates", () => {
  assert.equal(directionFromTinderHints(["message-outgoing"]), "me");
  assert.equal(directionFromTinderHints(["from-match"]), "them");
});

test("adapter selects the text bubble and chat composer, never the main-page center", async () => {
  const {readFile} = await import("node:fs/promises");
  const adapter = await readFile(new URL("../src/tinder-adapter.ts", import.meta.url),"utf8");
  assert.match(adapter,/visibleBubbleRect\(element, composerRect\)/);
  assert.match(adapter,/directionFromChatColumnGeometry\(bubbleRect, composerRect\)/);
  assert.match(adapter,/messageBubbleSized\(rect, composerRect\)/);
  assert.doesNotMatch(adapter,/rootCenter|document\.querySelector\("main"\) \?\? document\.body/);
});

test("verified Tinder DOM sends and received bubbles are identified by actual classes", () => {
  const incoming = [
    "msg BreakWord D(ib) C($c-ds-text-chat-bubble-receive) msg--received",
    "msgBackground--received Bgc($c-ds-background-secondary)"
  ];
  const outgoing = [
    "msg BreakWord D(ib) C($c-ds-text-chat-bubble-send)",
    "Bgc($c-ds-background-chat-bubble-send)"
  ];
  assert.equal(directionFromVerifiedTinderClasses(incoming), "them");
  assert.equal(directionFromVerifiedTinderClasses(outgoing), "me");
  assert.equal(directionFromVerifiedTinderClasses([]), "unknown");
  assert.equal(directionFromVerifiedTinderClasses([...incoming, ...outgoing]), "unknown");
  assert.equal(unansweredStatus([{ direction: directionFromVerifiedTinderClasses(incoming), text:"Toi?" }]), "unanswered");
});

test("adapter reads one Tinder article message text without message timestamps or status wrappers", async () => {
  const {readFile} = await import("node:fs/promises");
  const adapter = await readFile(new URL("../src/tinder-adapter.ts",import.meta.url),"utf8");
  assert.match(adapter, /ol\[aria-label="Messages" i\]/);
  assert.match(adapter, /transcript\.querySelectorAll<HTMLElement>\('\[role="article"\]'\)/);
  assert.match(adapter, /querySelector<HTMLElement>\('\.msg \.text'\)/);
  assert.match(adapter, /directionFromVerifiedTinderClasses\(markers\)/);
  assert.match(adapter, /return verified\.slice\(-Math\.max/);
});

test("an empty verified transcript never falls back to page-wide Messages sidebar candidates", async () => {
  const {readFile} = await import("node:fs/promises");
  const source = await readFile(new URL("../src/tinder-adapter.ts", import.meta.url), "utf8");
  const candidateFn = source.slice(source.indexOf("function candidateMessages("), source.indexOf("function simpleHash("));
  assert.match(candidateFn, /if \(transcript\) \{/);
  assert.match(candidateFn, /return verified\.slice\(-Math\.max;/);
  assert.match(candidateFn, /for \(const selector of MESSAGE_SELECTORS\)/);
  assert.ok(candidateFn.indexOf("return verified.slice(-Math.max(1,Math.min(maxItems,1000)))") < candidateFn.indexOf("for (const selector of MESSAGE_SELECTORS)"));
  assert.match(candidateFn, /visible\(element\) && !element\.contains\(composer\)/);
});


/** Synthetic structure only, modeled after user-provided redacted diagnostics:
 * 0 verified message articles, 1 generic aria-label match: Send message button.
 * Never commit raw Tinder HTML, names, thread identifiers or screenshots.
 */
test("empty Tinder match: Send message button is NOT counted as a message", () => {
  const matchesAncestorSelector = (selectors) => ({
    closest(selector) {
      const parts = selector.split(",").map(part => part.trim());
      return selectors.some(part => parts.includes(part)) ? {} : null;
    }
  });
  assert.match(NON_MESSAGE_UI_CONTROL_SELECTOR, /button/);
  assert.equal(isTinderMessageUiControl(matchesAncestorSelector(["button"])), true);
  assert.equal(isTinderMessageUiControl(matchesAncestorSelector(["form"])), true);
  assert.equal(isTinderMessageUiControl(matchesAncestorSelector(['[role="button"]'])), true);
  assert.equal(isTinderMessageUiControl(matchesAncestorSelector(["nav"])), true);
  assert.equal(isTinderMessageUiControl(matchesAncestorSelector(['[role="textbox"]'])), true);
  assert.equal(isTinderMessageUiControl(matchesAncestorSelector([])), false); // real bubble without controls
});

test("Tinder adapter scopes fallback candidates to the chat pane and filters controls before reading message text", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/tinder-adapter.ts", import.meta.url), "utf8");
  const fallback = source.slice(source.indexOf("const conversationRoot = composer.closest"), source.indexOf("// Multiple broad selectors"));
  assert.match(fallback, /composer\.closest<HTMLElement>\("\.chat"\)/);
  assert.match(fallback, /conversationRoot && !conversationRoot\.contains\(element\)/);
  assert.match(fallback, /if \(isTinderMessageUiControl\(element\)\) continue;/);
  assert.ok(fallback.indexOf("isTinderMessageUiControl(element)") < fallback.indexOf("const text = messageText(element)"));
  assert.match(source, /if \(transcript\) \{[\s\S]*return verified\.slice\(-Math\.max/);
});
