import assert from "node:assert/strict";
import test from "node:test";
import { unansweredStatus, lastUnansweredEvidence } from "../src/tinder-unanswered-backlog.ts";

const incoming = (text) => ({ direction: "them", text });
const outgoing = (text) => ({ direction: "me", text });
const unknown = (text) => ({ direction: "unknown", text });

test("an older unanswered incoming message is eligible regardless of its age", () => {
  const history = [incoming("Salut"), outgoing("Lhamdolilah et toi"), incoming("Toi?")];
  assert.equal(unansweredStatus(history), "unanswered");
  assert.equal(lastUnansweredEvidence(history), "Lhamdolilah et toi\u001fToi?");
});

test("a subsequent outbound message means no catch-up reply should be sent", () => {
  assert.equal(unansweredStatus([incoming("Toi?"), outgoing("ça va merci")]), "already-replied");
  assert.equal(lastUnansweredEvidence([incoming("Toi?"), outgoing("ça va merci")]), null);
});

test("unknown last bubble blocks automation; unloaded or empty transcript never triggers", () => {
  assert.equal(unansweredStatus([incoming("Salut"), unknown("autre")]), "unrecognized-direction");
  assert.equal(unansweredStatus([]), "no-messages");
  assert.equal(unansweredStatus([outgoing("Hi")]), "already-replied");
  assert.equal(lastUnansweredEvidence([unknown("unknown")]), null);
});

test("incoming identity is independent of how many older bubbles Tinder lazy-loads", () => {
  const older = [incoming("Ça va?"), outgoing("Très bien"), incoming("Toi?")];
  const moreHistory = [incoming("Hey"), outgoing("Salut"), ...older];
  assert.equal(lastUnansweredEvidence(older), lastUnansweredEvidence(moreHistory));
});

test("reply attempt is persisted before Tinder send; old message claims survive midnight", async () => {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(new URL("../src/content.ts", import.meta.url), "utf8");
  const background = await readFile(new URL("../src/background.ts", import.meta.url), "utf8");
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../src/tinder-adapter.ts", import.meta.url), "utf8");
  assert.match(content, /adapter\.inspectUnanswered\(\)/);
  assert.match(content, /Unanswered incoming message found \(old or new\)/);
  assert.match(content, /snapshot\.legacyIncomingKey/);
  assert.ok(content.indexOf("await saveState(freshState)") < content.indexOf("await adapter.send(part)"));
  assert.match(content, /finalSnapshot\.latestIncomingKey !== currentSnapshot\.latestIncomingKey/);
  assert.match(content, /autoReplyPausedAfterGlobalStop\(conversationRef\)/);
  assert.match(background, /date: today\(\)/);
  assert.doesNotMatch(background, /candidate\.date !== today\(\)\) return defaultAutoState/);
  assert.match(runner, /replyInProgress/);
  assert.match(runner, /leaseMs/);
  assert.match(adapter, /lastUnansweredEvidence/);
});
