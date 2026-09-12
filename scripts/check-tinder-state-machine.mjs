import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyTinderPath, isObservedV1Transition, planNavigation } from "../src/tinder-state-machine.ts";

const fixtureUrl = new URL("../fixtures/tinder-state-regression.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

for (const route of fixture.routes) {
  const actual = classifyTinderPath(route.path);
  assert.equal(actual.state, route.state, `${route.path} should classify as ${route.state}`);
  if (route.conversationRef) assert.equal(actual.conversationRef, route.conversationRef);
}

for (let index = 1; index < fixture.observedSequence.length; index += 1) {
  const from = fixture.observedSequence[index - 1];
  const to = fixture.observedSequence[index];
  assert.equal(isObservedV1Transition(from, to), true, `${from} -> ${to} should remain supported`);
}

assert.deepEqual(
  planNavigation(classifyTinderPath("/app/explore"), "scan-inbox"),
  { from: "discovery", target: "inbox", reason: "conversation discovery requires inbox", path: "/app/matches" }
);
assert.equal(planNavigation(classifyTinderPath("/app/matches"), "swipe").path, "/app/recs");
assert.equal(
  planNavigation(classifyTinderPath("/app/matches"), "process-thread", "thread-fixture-001").path,
  "/app/messages/thread-fixture-001"
);
assert.equal(planNavigation(classifyTinderPath("/app/matches"), "process-thread").path, null);

console.log(`Tinder state regression fixtures passed (${fixture.routes.length} routes).`);
