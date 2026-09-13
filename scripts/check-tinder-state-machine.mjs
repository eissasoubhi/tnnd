import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planBoundedTinderJob } from "../src/tinder-orchestrator.ts";
import { completeTinderSchedulerStep, canResumeCheckpoint, planTinderSchedulerStep } from "../src/tinder-scheduler.ts";
import { classifyTinderPath, composeTinderUiState, isObservedV1Transition, planNavigation } from "../src/tinder-state-machine.ts";

const fixtureUrl = new URL("../fixtures/tinder-state-regression.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

for (const route of fixture.routes) {
  const actual = classifyTinderPath(route.path);
  assert.equal(actual.state, route.state, `${route.path} should classify as ${route.state}`);
  assert.equal(actual.discoveryContext, route.discoveryContext, `${route.path} should preserve discovery context`);
  if (route.conversationRef) assert.equal(actual.conversationRef, route.conversationRef);
}

for (const observation of fixture.uiObservations) {
  const actual = composeTinderUiState(classifyTinderPath(observation.path), observation.signals);
  assert.equal(actual.overlay, observation.overlay, `${observation.name} overlay mismatch`);
  assert.equal(actual.profileState, observation.profileState, `${observation.name} profile-state mismatch`);
  assert.equal(actual.boundedActionAllowed, observation.boundedActionAllowed, `${observation.name} action-gate mismatch`);
  if (observation.signals.sidebarState) assert.equal(actual.sidebarState, observation.signals.sidebarState);
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

const blockedByModal = planBoundedTinderJob(
  composeTinderUiState(classifyTinderPath("/app/explore"), { visibleModal: true }),
  "swipe"
);
assert.equal(blockedByModal.allowed, false);
assert.equal(blockedByModal.navigation.path, null);

const safeDiscovery = planBoundedTinderJob(
  composeTinderUiState(classifyTinderPath("/app/recs"), { visibleModal: false }),
  "swipe"
);
assert.equal(safeDiscovery.allowed, true);
assert.equal(safeDiscovery.navigation.path, null);

const unresolvedThread = planBoundedTinderJob(
  composeTinderUiState(classifyTinderPath("/app/matches")),
  "process-thread"
);
assert.equal(unresolvedThread.allowed, false);

const syncFromUnknown = planBoundedTinderJob(
  composeTinderUiState(classifyTinderPath("/settings")),
  "sync-only"
);
assert.equal(syncFromUnknown.allowed, true);

const schedulerNavigate = planTinderSchedulerStep(
  composeTinderUiState(classifyTinderPath("/app/recs")),
  { id: "job-fixture-inbox", kind: "scan-inbox" },
  "2026-09-13T00:00:00.000Z"
);
assert.equal(schedulerNavigate.action, "navigate");
assert.equal(schedulerNavigate.checkpoint.phase, "navigating");
assert.equal(schedulerNavigate.checkpoint.navigationTarget, "/app/matches");
assert.equal(canResumeCheckpoint(schedulerNavigate.checkpoint), true);

const schedulerBlocked = planTinderSchedulerStep(
  composeTinderUiState(classifyTinderPath("/app/explore"), { visibleModal: true }),
  { id: "job-fixture-swipe", kind: "swipe" },
  "2026-09-13T00:00:01.000Z"
);
assert.equal(schedulerBlocked.action, "none");
assert.equal(schedulerBlocked.checkpoint.phase, "blocked");

const completed = completeTinderSchedulerStep(schedulerNavigate.checkpoint, "/app/matches", "2026-09-13T00:00:02.000Z");
assert.equal(completed.phase, "completed");
assert.equal(completed.lastPath, "/app/matches");
assert.equal(completed.navigationTarget, null);

console.log(`Tinder state regression fixtures passed (${fixture.routes.length} routes, ${fixture.uiObservations.length} UI observations).`);
