import assert from "node:assert/strict";
import test from "node:test";
import { directionFromChatColumnGeometry, messageBubbleSized } from "../src/tinder-message-layout.ts";
import { directionFromTinderHints } from "../src/tinder-message-evidence.ts";
import { unansweredStatus } from "../src/tinder-unanswered-backlog.ts";

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
