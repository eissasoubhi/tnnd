import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { explainLauncherStartRefusal } from "../src/unified-launcher-failure.ts";
import { parseUnifiedWebSettings, explainUnifiedWebSettingsErrors } from "../src/unified-web-settings.ts";
import { DEFAULT_SMART_AUTO_SWIPE_CONFIG } from "../src/tinder-smart-auto-swipe-policy.ts";
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

test("manual Swipe shows actionable, accurate ledger guidance rather than an opaque error", async () => {
  const guidance = explainLauncherStartRefusal("server_attempt_unresolved");
  assert.equal(guidance.reviewAttempts, true);
  assert.match(guidance.message, /Uncertain/);
  assert.match(guidance.message, /Reserved/);
  assert.match(guidance.message, /Aucun Like n'a été relancé/);
  assert.equal(guidance.message.includes("server_attempt_unresolved"), false);
  const launcher = await readFile(new URL("../src/launcher.ts", import.meta.url), "utf8");
  const section = launcher.slice(launcher.indexOf('const guidance = explainLauncherStartRefusal'));
  assert.match(section, /explainLauncherStartRefusal\(reason\)/);
  assert.match(section, /guidance.reviewAttempts/);
  assert.match(section, /#smart-swipe-activity/);
  assert.match(section, /Examiner les tentatives dans TNND Web/);
});

test("legacy daily Right Likes cap no longer blocks Swipe, Chat, Matches or counter display", async () => {
  const raw = {
    ...DEFAULT_SMART_AUTO_SWIPE_CONFIG,
    enabled: true,
    maxRightSwipesPerDay: 500,
    timeZone: "Europe/Paris"
  };
  const parsed = parseUnifiedWebSettings({ settings: raw });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.legacyDailyLikeCap, true);
  assert.equal(parsed.settings.maxRightSwipesPerDay, null);
  assert.equal(raw.maxRightSwipesPerDay, 500, "original API payload remains unmodified");
  for (const mode of ["swipe", "new-match", "active-chat"]) {
    assert.ok(parsed.settings.priority.includes(mode));
  }
  assert.deepEqual(parseUnifiedWebSettings({ settings: {
    ...raw, maxRightSwipesPerDay: null
  } }), { ok: true, settings: { ...raw, maxRightSwipesPerDay: null }, legacyDailyLikeCap: false });
  const worker = await readFile(new URL("../src/unified-controller-background.ts", import.meta.url),"utf8");
  assert.equal((worker.match(/parseUnifiedWebSettings\(await .*Response\.json\(\)\)/g) ?? []).length, 2);
  assert.match(worker,/parseUnifiedWebSettings\(await response\.json\(\)\)/);
  assert.doesNotMatch(worker,/Corrige les priorités avant de démarrer/);
});

test("compatibility never hides invalid priorities, consent, missing timezone or wrong limits",()=>{
  const original = { ...DEFAULT_SMART_AUTO_SWIPE_CONFIG, enabled:true,
    maxRightSwipesPerDay: 500, timeZone:"Europe/Paris" };
  const bad = [
    [{ ...original, priority:["swipe", "swipe", "active-chat"] },"priority"],
    [{ ...original, priority:["swipe","new-match"] },"priority"],
    [{ ...original, sessionsPerDay: 0 },"sessionsPerDay"],
    [{ ...original, enabled:"true" },"enabled"],
    [{ ...original, timeZone:"Unknown/Nowhere" },"timeZone"],
    [{ ...original, maxRightSwipesPerDay: 1001 },"maxRightSwipesPerDay"],
    [{ ...original, maxRightSwipesPerDay: "500" },"maxRightSwipesPerDay"],
    [{ ...original, maxRightSwipesPerDay: undefined },"maxRightSwipesPerDay"]
  ];
  for(const [settings, field] of bad) {
    const result = parseUnifiedWebSettings({ settings });
    assert.equal(result.ok, false, field);
    assert.ok(result.errors.includes(field), field + " was not validated");
  }
  assert.deepEqual(parseUnifiedWebSettings({}),{ok:false, errors:["settings_missing"]});
  assert.deepEqual(parseUnifiedWebSettings(null),{ok:false, errors:["server_response"]});
  assert.match(explainUnifiedWebSettingsErrors(["priority"] ),/ordre des activités Swipe/);
  assert.match(explainUnifiedWebSettingsErrors(["maxRightSwipesPerDay"] ),/ancien plafond quotidien/);
  assert.doesNotMatch(explainUnifiedWebSettingsErrors(["timeZone"] ),/Corrige les priorités/);
});

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
  assert.match(html, /aria-selected="false"/);
  assert.match(launcher, /TNND_UNIFIED_SELECT_MODE/);
  assert.match(launcher, /button.addEventListener\("keydown"/);
  assert.match(launcher, /requestMode\(mode\)/);
  assert.match(html, /role="tabpanel"/);
  assert.match(launcher, /setAttribute\("aria-selected"/);
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
