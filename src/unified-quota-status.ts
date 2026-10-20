import { tinderAccountDayKey } from "./tinder-smart-auto-swipe-policy.ts";

/** Read-only quota evidence for the account's *current* local day.
 * An absent, stale or malformed server response is UNKNOWN, never zero.
 * Does not arm Swipe, clear quotas, send Likes, or alter sessions.
 */
export interface DailyQuotaEvidence {
  used: number;
  limit: number;
  reached: boolean;
  dayKey: string;
}

export function verifiedDailyQuota(
  settings: { maxRightSwipesPerDay: number; timeZone: string },
  summary: unknown,
  nowMs: number
): DailyQuotaEvidence | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const row = summary as { dayKey?: unknown; attemptsToday?: unknown };
  if (typeof settings.timeZone !== "string" || !Number.isSafeInteger(settings.maxRightSwipesPerDay) ||
      settings.maxRightSwipesPerDay < 1 || !Number.isFinite(nowMs) ||
      !Number.isSafeInteger(row.attemptsToday) || (row.attemptsToday as number) < 0) return null;
  let day: string;
  try { day = tinderAccountDayKey(nowMs, settings.timeZone); }
  catch { return null; }
  if (row.dayKey !== day) return null; // stale or unrelated account day
  const used = row.attemptsToday as number;
  return { used, limit: settings.maxRightSwipesPerDay,
    reached: used >= settings.maxRightSwipesPerDay, dayKey: day };
}
