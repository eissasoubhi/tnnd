import assert from "node:assert/strict";
import {
  accountMinuteOfDay, scheduleSmartSwipeSession, beginScheduledSwipeSession,
  closeExpiredScheduledSwipeSession, recoverPausedSwipeSession
} from "../src/tinder-smart-swipe-daily-scheduler.ts";
import { DEFAULT_SMART_AUTO_SWIPE_CONFIG as defaults, emptySmartSwipeDay, MIN_SESSION_BREAK_MS } from "../src/tinder-smart-auto-swipe-policy.ts";
const tz = "Europe/Paris";
const cfg = { ...defaults, enabled: true, sessionsPerDay: 3, sessionDurationMinSeconds: 300, sessionDurationMaxSeconds: 600 };
const time = iso => Date.parse(iso);
const now = time("2026-10-16T08:00:00Z"); // 10 AM Paris, second slot (08:00–16:00)
const fresh = emptySmartSwipeDay("2026-10-16");
assert.equal(accountMinuteOfDay(now, tz), 600);
assert.equal(scheduleSmartSwipeSession(cfg, fresh, now, tz).action, "due");
let progress = beginScheduledSwipeSession(cfg, fresh, now, tz, () => 0);
assert.equal(progress.startedSessions, 1);
assert.equal(progress.lastSessionSlotIndex, 1);
assert.equal(progress.session.durationMs, 300000);
assert.equal(scheduleSmartSwipeSession(cfg, progress, now + 1000, tz).action, "running");
const finished = closeExpiredScheduledSwipeSession(cfg, progress, now + 300000, tz);
assert.equal(finished.session, null);
assert.equal(scheduleSmartSwipeSession(cfg, finished, now + MIN_SESSION_BREAK_MS + 300000, tz).reason, "slot_consumed");
const nextTime = time("2026-10-16T15:00:00Z"); // 17:00 Paris = third slot
assert.equal(scheduleSmartSwipeSession(cfg, finished, nextTime, tz).action, "due");
progress = beginScheduledSwipeSession(cfg, finished, nextTime, tz, () => 1);
assert.equal(progress.startedSessions, 2);
assert.equal(progress.lastSessionSlotIndex, 2);
assert.equal(progress.session.durationMs, 600000);
const last = closeExpiredScheduledSwipeSession(cfg, progress, nextTime + 600000, tz);
assert.equal(scheduleSmartSwipeSession(cfg, last, nextTime + MIN_SESSION_BREAK_MS + 600000, tz).action, "wait");
assert.equal(scheduleSmartSwipeSession(cfg, {...fresh, startedSessions: 1}, now, tz).reason, "slot_history_unknown");
assert.equal(scheduleSmartSwipeSession(cfg, {...fresh, rightSwipesReserved: 1}, now, tz).reason, "unresolved_attempt");
assert.equal(scheduleSmartSwipeSession(cfg, {...fresh, dayKey: "2026-10-15"}, now, tz).reason, "stale_day");
assert.equal(scheduleSmartSwipeSession({...cfg, enabled: false}, fresh, now, tz).action, "disabled");
assert.equal(scheduleSmartSwipeSession({...cfg, maxRightSwipesPerDay: 2}, {...fresh, rightSwipesConfirmed: 2}, now, tz).reason, "daily_cap");
assert.equal(scheduleSmartSwipeSession(cfg, {...fresh, lastSessionSlotIndex: 99}, now, tz).reason, "invalid_slot_state");
const restored = recoverPausedSwipeSession(progress, nextTime + 10000, nextTime + 60*60*1000);
assert.equal(restored.session.runningSinceMs, null);
assert.equal(restored.session.activeElapsedMs, 10000);
assert.equal(recoverPausedSwipeSession(progress, nextTime - 1000, nextTime + 10000).session.runningSinceMs, null);
assert.equal(accountMinuteOfDay(time("2026-10-16T22:30:00Z"), tz), 30);
console.log("Smart Swipe evenly-spaced daily session scheduler checks passed.");
