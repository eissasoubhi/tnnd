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
