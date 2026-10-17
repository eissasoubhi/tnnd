import {
  emptySmartSwipeDay, rolloverSmartSwipeDay, tinderAccountDayKey,
  type SmartSwipeDailyProgress
} from "./tinder-smart-auto-swipe-policy.ts";

const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is number | null =>
  value === null || integer(value);

/** Malformed progress must not be replaced by an empty quota (fail closed). */
export function validSmartSwipeProgress(value: unknown): value is SmartSwipeDailyProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Partial<SmartSwipeDailyProgress>;
  if (typeof p.dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.dayKey) ||
      !integer(p.startedSessions) || !integer(p.rightSwipesConfirmed) ||
      !integer(p.rightSwipesReserved) || !timestamp(p.lastSessionEndedAtMs)) return false;
  if (p.session === null) return true;
  if (!p.session || typeof p.session !== "object") return false;
  const s = p.session;
  return integer(s.durationMs) && s.durationMs > 0 && integer(s.activeElapsedMs) &&
    timestamp(s.runningSinceMs) && timestamp(s.nextRightSwipeNotBeforeMs);
}

export type ProgressRead =
  | { ok: true; progress: SmartSwipeDailyProgress; needsSave: boolean }
  | { ok: false; reason: "corrupt-progress" | "unresolved-previous-day" | "invalid-account-time" };

export function readSmartSwipeProgress(
  stored: unknown, nowMs: number, timeZone: string
): ProgressRead {
  let dayKey: string;
  try { dayKey = tinderAccountDayKey(nowMs, timeZone); }
  catch { return { ok: false, reason: "invalid-account-time" }; }
  if (stored === undefined) return { ok: true, progress: emptySmartSwipeDay(dayKey), needsSave: true };
  if (!validSmartSwipeProgress(stored)) return { ok: false, reason: "corrupt-progress" };
  if (stored.dayKey === dayKey) return { ok: true, progress: stored, needsSave: false };
  const rolled = rolloverSmartSwipeDay(stored, nowMs, timeZone);
  if (!rolled) return { ok: false, reason: "unresolved-previous-day" };
  return { ok: true, progress: rolled, needsSave: true };
}
