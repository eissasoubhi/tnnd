import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  manualActivity, manualSwipeReleaseSafe, watcherSwitchSafety
} from "../src/unified-manual-mode-policy.ts";

const time = Date.parse("2026-10-20T18:00:00Z");
const settings = { maxRightSwipesPerDay: 100, timeZone: "Europe/Paris" };
const summary = { dayKey: "2026-10-20", attemptsToday: 5, unresolvedAttempts: 0 };
const progress = {
  dayKey: "2026-10-20", startedSessions: 1, rightSwipesConfirmed: 4,
  rightSwipesReserved: 0, lastSessionEndedAtMs: null, session: null
};

test("manual launcher accepts only the three explicit activity IDs", () => {
  assert.deepEqual(["swipe", "new-match", "active-chat"].map(manualActivity),
    ["swipe", "new-match", "active-chat"]);
  for (const invalid of [null, "", "matches", "chat", "swipe;STOP", {}, 1, "auto"]) {
    assert.equal(manualActivity(invalid), null);
  }
});

test("manual Swipe -> Matches/Chat release requires current, settled local and server evidence, even below quota", () => {
  assert.equal(manualSwipeReleaseSafe(settings, summary, progress, time), true);
  assert.equal(manualSwipeReleaseSafe(settings,
    { ...summary, attemptsToday: 100 }, progress, time), true);
  for (const server of [null, {}, { ...summary, unresolvedAttempts: 1 },
    { ...summary, unresolvedAttempts: undefined },
    { ...summary, dayKey: "2026-10-19" }]) {
    assert.equal(manualSwipeReleaseSafe(settings, server, progress, time), false);
  }
  for (const local of [null, {}, { ...progress, rightSwipesReserved: 1 },
    { ...progress, dayKey: "2026-10-19" }]) {
    assert.equal(manualSwipeReleaseSafe(settings, summary, local, time), false);
  }
  assert.equal(manualSwipeReleaseSafe({ ...settings, timeZone: "Invalid/Zone" },
    summary, progress, time), false);
});

test("a watched chat or match processing is never interrupted", () => {
  const idle = { enabled: true, phase: "waiting", phaseDetail: "Watching",
    matchPhase: "idle", activeConversationRef: null, activeConversationUntil: null };
  assert.equal(watcherSwitchSafety(idle, time).allowed, true);
  for (const phase of ["starting", "checking", "loading", "incoming", "generating", "sending", "error"]) {
    assert.equal(watcherSwitchSafety({ ...idle, phase }, time).allowed, false);
  }
  assert.equal(watcherSwitchSafety({ ...idle, phase: "waiting",
    phaseDetail: "Unanswered incoming message found; waiting for reply" }, time).allowed, false);
  assert.equal(watcherSwitchSafety({ ...idle, phaseDetail: "Current chat is busy replying; switching delayed until safe." }, time).allowed, false);
  assert.equal(watcherSwitchSafety({ ...idle, matchPhase: "verifying" }, time).allowed, false);
  assert.equal(watcherSwitchSafety({ ...idle, matchPhase: "opener" }, time).allowed, false);
  assert.equal(watcherSwitchSafety({ ...idle, activeConversationRef: "ref",
    activeConversationUntil: new Date(time + 60000).toISOString() }, time).allowed, false);
  assert.equal(watcherSwitchSafety({ ...idle, activeConversationRef: "ref",
    activeConversationUntil: new Date(time - 1000).toISOString() }, time).allowed, true);
  assert.equal(watcherSwitchSafety(undefined, time).allowed, false);
});

test("launcher controls and worker route all manual commands through verified exclusive transition", async () => {
  const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const [html, launcher, worker, watcher, background, content] = await Promise.all([
    "public/launcher.html", "src/launcher.ts", "src/unified-controller-background.ts",
    "src/tinder-global-existing-runner.ts", "src/background.ts", "src/content.ts"
  ].map(read));
  assert.match(html, /id="toggleAutomation"/);
  for (const mode of ["swipe", "new-match", "active-chat"]) {
    assert.match(html, new RegExp('data-activity="' + mode + '"'));
  }
  assert.match(html, /aria-pressed="false"/);
  assert.match(launcher, /TNND_UNIFIED_SELECT_MODE/);
  assert.match(launcher, /setAttribute\("aria-pressed"/);
  assert.match(worker, /launcher_only/);
  assert.match(worker, /manualActivity\(\(message as \{ mode\?: unknown \}\)\.mode\)/);
  assert.match(worker, /watcherSwitchSafety\(watcher\)/);
  assert.match(worker, /await stopEverything\(\)/);
  assert.match(worker, /safeSwipeHandoff\(session, settings\)/);
  assert.match(worker, /if \(requestedMode === "swipe"\) return/);
  assert.match(worker, /manualMode: requestedMode/);
  assert.match(worker, /!master\.userId \|\| master\.manualMode/);
  assert.match(watcher, /manualActivity === "new-match"/);
  assert.match(watcher, /state\.manualActivity !== "active-chat"/);
  assert.match(watcher, /manualActivity: null/);
  assert.match(background, /TNND_GET_EXISTING_REPLY_MODE_PERMISSION/);
  assert.match(background, /state\.manualActivity === "new-match"/);
  assert.match(content, /existingRepliesAllowedByMode\(\)/);
  assert.match(content, /Manual Matches mode selected; existing-chat reply deferred/);
});
