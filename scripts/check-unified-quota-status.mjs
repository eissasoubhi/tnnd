import assert from "node:assert/strict";
import { verifiedDailyQuota } from "../src/unified-quota-status.ts";

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
