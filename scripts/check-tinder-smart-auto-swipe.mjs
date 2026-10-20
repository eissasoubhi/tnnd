import assert from "node:assert/strict";
import {
  DEFAULT_SMART_AUTO_SWIPE_CONFIG as defaults,
  validateSmartAutoSwipeConfig, sampleInclusiveInteger, selectTinderActivity,
  remainingChatSeconds, tinderAccountDayKey, emptySmartSwipeDay,
  rolloverSmartSwipeDay, MIN_SESSION_BREAK_MS,
  beginSmartSwipeSession, pauseSmartSwipeSession, resumeSmartSwipeSession,
  smartSwipeElapsedMs, finishSmartSwipeSession, planSmartRightSwipe,
  reserveSmartRightSwipe, confirmSmartRightSwipe, releaseNotClickedSmartRightSwipe
} from "../src/tinder-smart-auto-swipe-policy.ts";

const cfg = { ...defaults, enabled: true };
const now = Date.parse("2026-10-15T09:00:00Z");
const tz = "Europe/Paris";
assert.deepEqual(validateSmartAutoSwipeConfig(cfg), []);
assert.ok(validateSmartAutoSwipeConfig({ ...cfg, priority: ["swipe", "swipe", "active-chat"] }).includes("priority"));
assert.ok(validateSmartAutoSwipeConfig({ ...cfg, swipeDelayMinSeconds: 6, swipeDelayMaxSeconds: 2 }).includes("swipeDelayRange"));
assert.equal(sampleInclusiveInteger(2, 5, () => 0), 2);
assert.equal(sampleInclusiveInteger(2, 5, () => 1), 5);
assert.equal(sampleInclusiveInteger(5, 5, () => 0.5), 5);
assert.throws(() => sampleInclusiveInteger(2, 5, () => NaN));

const allReady = {
  swipeSessionAvailable: true, newMatchesAvailable: true, activeChatsAvailable: true,
  activeConversationInProgress: false, mandatoryStop: false
};
assert.equal(selectTinderActivity(cfg, allReady), "swipe");
assert.equal(selectTinderActivity({ ...cfg, priority: ["new-match", "active-chat", "swipe"] }, allReady), "new-match");
assert.equal(selectTinderActivity(cfg, { ...allReady, swipeSessionAvailable: false }), "new-match");
assert.equal(selectTinderActivity(cfg, { ...allReady, activeConversationInProgress: true }), "active-chat");
assert.equal(selectTinderActivity(cfg, { ...allReady, activeConversationInProgress: true, activeChatsAvailable: false }), "new-match");
assert.equal(selectTinderActivity(
  { ...cfg, pauseSwipeDuringActiveConversation: false },
  { ...allReady, activeConversationInProgress: true }
), "swipe");
assert.equal(selectTinderActivity(cfg, { ...allReady, mandatoryStop: true }), null);

assert.equal(remainingChatSeconds(cfg, 10_000), Infinity);
assert.equal(remainingChatSeconds({ ...cfg, maxActiveChatSecondsPerConversationPerDay: 1800 }, 600), 1200);
assert.equal(remainingChatSeconds({ ...cfg, maxActiveChatSecondsPerConversationPerDay: 1800 }, 1800), 0);
assert.equal(remainingChatSeconds({ ...cfg, maxActiveChatSecondsPerConversationPerDay: 1800 }, 1900), 0);
assert.equal(tinderAccountDayKey(Date.parse("2026-10-15T22:30:00Z"), tz), "2026-10-16");

let progress = emptySmartSwipeDay(tinderAccountDayKey(now, tz));
progress = beginSmartSwipeSession(cfg, progress, now, tz, () => 0);
assert.ok(progress);
assert.equal(progress.startedSessions, 1);
assert.equal(progress.session.durationMs, 300_000);
assert.equal(planSmartRightSwipe(cfg, progress, now, tz, {
  activeConversationInProgress: true, mandatoryStop: false
}), "paused-for-chat");
const options = { activeConversationInProgress: false, mandatoryStop: false };
assert.equal(planSmartRightSwipe(cfg, progress, now, tz, options), "ready");
progress = reserveSmartRightSwipe(cfg, progress, now, tz, () => 0, options);
assert.ok(progress);
assert.equal(progress.rightSwipesReserved, 1);
assert.equal(progress.session.nextRightSwipeNotBeforeMs, now + 2000);
assert.equal(planSmartRightSwipe(cfg, progress, now + 1000, tz, options), "unresolved-attempt");
assert.deepEqual(confirmSmartRightSwipe(progress, false), progress);
progress = confirmSmartRightSwipe(progress, true);
assert.equal(progress.rightSwipesConfirmed, 1);
assert.equal(planSmartRightSwipe(cfg, progress, now + 1000, tz, options), "swipe-delay");
assert.equal(planSmartRightSwipe(cfg, progress, now + 2000, tz, options), "ready");

progress = pauseSmartSwipeSession(progress, now + 60_000);
assert.equal(smartSwipeElapsedMs(progress.session, now + 240_000), 60_000);
assert.equal(planSmartRightSwipe(cfg, progress, now + 240_000, tz, options), "session-paused");
progress = resumeSmartSwipeSession(progress, now + 240_000);
assert.equal(smartSwipeElapsedMs(progress.session, now + 300_000), 120_000);
assert.equal(planSmartRightSwipe(cfg, progress, now + 480_000, tz, options), "session-expired");
progress = finishSmartSwipeSession(progress, now + 480_000);
assert.equal(beginSmartSwipeSession(cfg, progress, now + 480_000 + MIN_SESSION_BREAK_MS - 1, tz, () => 0), null);
progress = beginSmartSwipeSession(cfg, progress, now + 480_000 + MIN_SESSION_BREAK_MS, tz, () => 1);
assert.equal(progress.startedSessions, 2);
assert.equal(progress.session.durationMs, 600_000);
progress = finishSmartSwipeSession(progress, now + 480_000 + MIN_SESSION_BREAK_MS + 600_000);
progress = beginSmartSwipeSession(cfg, progress, now + 480_000 + 2*MIN_SESSION_BREAK_MS + 600_000, tz, () => 0);
assert.equal(progress.startedSessions, 3);
progress = finishSmartSwipeSession(progress, now + 480_000 + 2*MIN_SESSION_BREAK_MS + 900_000);
assert.equal(beginSmartSwipeSession(cfg, progress, now + 480_000 + 3*MIN_SESSION_BREAK_MS + 900_000, tz, () => 0), null);
assert.equal(rolloverSmartSwipeDay(progress, Date.parse("2026-10-16T09:00:00Z"), tz).startedSessions, 0);
assert.equal(rolloverSmartSwipeDay({ ...progress, rightSwipesReserved: 1 }, Date.parse("2026-10-16T09:00:00Z"), tz), null);

const capped = { ...progress, rightSwipesConfirmed: cfg.maxRightSwipesPerDay };
assert.equal(beginSmartSwipeSession(cfg, capped, now + 3600_000, tz, () => 0), null);
assert.equal(planSmartRightSwipe(cfg, capped, now + 3600_000, tz, options), "daily-cap");
console.log("Smart Auto Swipe scheduling policy checks passed (pure logic, no Tinder actions).");

const preClickPending = { ...emptySmartSwipeDay("2026-10-15"),
  rightSwipesReserved: 1, session: {
    durationMs: 300_000, activeElapsedMs: 0, runningSinceMs: now,
    nextRightSwipeNotBeforeMs: now + 2_000
  }
};
const noClick = releaseNotClickedSmartRightSwipe(preClickPending, now);
assert.equal(noClick.rightSwipesReserved, 0, "proven no-click should release local pending slot");
assert.equal(noClick.rightSwipesConfirmed, 0, "not clicked must never count as UI-observed");
assert.equal(noClick.session.nextRightSwipeNotBeforeMs, now + 60_000, "cooldown");
assert.equal(preClickPending.rightSwipesReserved, 1, "pure helper must not mutate original");
assert.deepEqual(releaseNotClickedSmartRightSwipe(noClick, now), noClick,
  "cannot decrease reservation below zero");
