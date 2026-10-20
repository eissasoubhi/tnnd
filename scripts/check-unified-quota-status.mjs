import assert from "node:assert/strict";
import { verifiedDailyQuota } from "../src/unified-quota-status.ts";
import { reachedUnifiedLimits } from "../src/unified-reached-limits.ts";

const time = Date.parse("2026-10-20T18:00:00Z"); // 20:00 Paris (summer clock)
const settings = { maxRightSwipesPerDay: 100, timeZone: "Europe/Paris" };
const atCap = verifiedDailyQuota(settings, {
  dayKey: "2026-10-20", attemptsToday: 100, uiObservedToday: 99, unresolvedAttempts: 0
}, time);
assert.deepEqual(atCap, { dayKey: "2026-10-20", used: 100, limit: 100, reached: true });
assert.equal(verifiedDailyQuota(settings, { dayKey: "2026-10-20", attemptsToday: 99 }, time)?.reached, false);
assert.equal(verifiedDailyQuota(settings, { dayKey: "2026-10-20", attemptsToday: 101 }, time)?.reached, true);
for (const invalid of [
  null, undefined, {}, { dayKey: "2026-10-19", attemptsToday: 100 },
  { dayKey: "2026-10-20", attemptsToday: "100" },
  { dayKey: "2026-10-20", attemptsToday: -1 },
  { dayKey: "2026-10-20", attemptsToday: 2.5 }
]) assert.equal(verifiedDailyQuota(settings, invalid, time), null,
  "Unknown or stale account quota MUST not be claimed exhausted or available");
assert.equal(verifiedDailyQuota({ ...settings, timeZone: "Bad/Zone" },
  { dayKey: "2026-10-20", attemptsToday: 100 }, time), null);
const afterParisMidnight = Date.parse("2026-10-20T22:00:00Z");
assert.equal(verifiedDailyQuota(settings, {
  dayKey: "2026-10-20", attemptsToday: 100
}, afterParisMidnight), null, "A previous account-day quota is not today's quota");
assert.equal(verifiedDailyQuota(settings, {
  dayKey: "2026-10-21", attemptsToday: 0
}, afterParisMidnight)?.reached, false);
console.log("Unified daily Swipe quota status contract passed; no Tinder interaction.");

const fullSettings = { ...settings, sessionsPerDay: 3 };
const local = {
  dayKey: "2026-10-20", startedSessions: 3,
  rightSwipesConfirmed: 99, rightSwipesReserved: 0,
  lastSessionEndedAtMs: null, session: null
};
const summary = { dayKey: "2026-10-20", attemptsToday: 100,
  uiObservedToday: 99, unresolvedAttempts: 0 };
const full = reachedUnifiedLimits(fullSettings, summary, local, time);
assert.deepEqual(full.reached, [
  { id: "swipe-attempts", label: "Tentatives de Like (TNND)", used: 100, max: 100, dayKey: "2026-10-20" },
  { id: "swipe-sessions", label: "Sessions Auto Swipe", used: 3, max: 3, dayKey: "2026-10-20" }
]);
const incomplete = reachedUnifiedLimits(fullSettings,
  { dayKey: "2026-10-20", attemptsToday: 99 }, { ...local, startedSessions: 1 }, time);
assert.deepEqual(incomplete.reached, [], "No false exhausted badges for limits not reached");
assert.deepEqual(reachedUnifiedLimits(fullSettings,
  { dayKey: "2026-10-19", attemptsToday: 100 }, local, time).reached, [],
  "Never report a previous day's limits as reached today");
assert.deepEqual(reachedUnifiedLimits(fullSettings, null, local, time).reached, [],
  "Unavailable server evidence is unknown, never an invented reached limit");
assert.deepEqual(reachedUnifiedLimits(fullSettings, summary,
  { ...local, dayKey: "2026-10-19" }, time).reached.map(row => row.id), ["swipe-attempts"],
  "Old browser session data cannot exhaust today's sessions");
assert.deepEqual(reachedUnifiedLimits(fullSettings, summary,
  { ...local, startedSessions: "3" }, time).reached.map(row => row.id), ["swipe-attempts"],
  "Malformed session counters cannot be trusted");
assert.deepEqual(reachedUnifiedLimits(fullSettings, summary,
  { ...local, startedSessions: 4 }, time).reached.map(row => row.used), [100, 4],
  "Use exact observed value rather than silently clamping an overage");
console.log("Exact reached Swipe attempt/session counters verified without Tinder.");

assert.equal(full.safeToReleaseSwipe, true, "full cap with both ledgers settled permits exclusive handoff");
assert.equal(reachedUnifiedLimits(fullSettings,
  { ...summary, unresolvedAttempts: 1 }, local, time).safeToReleaseSwipe, false,
  "Never hand off with an outstanding server attempt");
assert.equal(reachedUnifiedLimits(fullSettings, summary,
  { ...local, rightSwipesReserved: 1 }, time).safeToReleaseSwipe, false,
  "Never hand off with a locally outstanding potential Like");
assert.equal(reachedUnifiedLimits(fullSettings,
  { ...summary, unresolvedAttempts: undefined }, local, time).safeToReleaseSwipe, false,
  "Unknown server reservations are NOT settled");
assert.equal(reachedUnifiedLimits(fullSettings, summary,
  { ...local, dayKey: "2026-10-19" }, time).safeToReleaseSwipe, false,
  "Yesterday's local progress cannot authorize today's handoff");
assert.equal(reachedUnifiedLimits(fullSettings,
  { ...summary, attemptsToday: 99 }, local, time).safeToReleaseSwipe, false,
  "Below-cap Swipe cannot be moved by the daily-cap handoff");
console.log("Account-day auto-handoff eligibility fails closed for pending/unknown Likes.");

assert.deepEqual(full.counters, [
  { id: "swipe-attempts", label: "Tentatives de Like (TNND)", used: 100,
    max: 100, dayKey: "2026-10-20", reached: true },
  { id: "swipe-sessions", label: "Sessions Auto Swipe", used: 3,
    max: 3, dayKey: "2026-10-20", reached: true }
], "Reached daily counters must always have their exact counts");
const available = reachedUnifiedLimits(fullSettings, {
  dayKey: "2026-10-20", attemptsToday: 47, uiObservedToday: 45,
  unresolvedAttempts: 0
}, { ...local, startedSessions: 1 }, time);
assert.deepEqual(available.counters.map(x => [x.used, x.max, x.reached]), [
  [47, 100, false], [1, 3, false]
], "Daily counters remain displayed even below the limit");
const missingServer = reachedUnifiedLimits(fullSettings, null, local, time);
assert.deepEqual(missingServer.counters.map(x => [x.used, x.max, x.reached]), [
  [null, 100, false], [3, 3, true]
], "Offline remote journal cannot remove independently verified local sessions");
const missingLocal = reachedUnifiedLimits(fullSettings, summary, undefined, time);
assert.deepEqual(missingLocal.counters.map(x => [x.used, x.max, x.reached]), [
  [100, 100, true], [null, 3, false]
], "Unknown local progress must not be presented as 0 started sessions");
const wrongDay = reachedUnifiedLimits(fullSettings,
  { ...summary, dayKey: "2026-10-19" },
  { ...local, dayKey: "2026-10-19" }, time);
assert.deepEqual(wrongDay.counters.map(x => [x.used, x.max, x.reached]), [
  [null, 100, false], [null, 3, false]
], "Previous-day counters must not look current");
console.log("Always-visible exact 2-counter quota statuses validated.");
