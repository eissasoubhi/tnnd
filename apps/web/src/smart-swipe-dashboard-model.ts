/** Server records attempts and observed card transitions, never Tinder receipts. */
export interface SmartSwipeAttemptSummary {
  dayKey: string;
  attemptsToday: number;
  uiObservedToday: number;
  unresolvedAttempts: number;
}
export interface SmartSwipeAttempt {
  dayKey: string;
  status: "reserved" | "ui_observed" | "uncertain";
  createdAt: string;
  resolvedAt: string | null;
}
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const day = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseSmartSwipeSummary(value: unknown): SmartSwipeAttemptSummary | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!day(item.dayKey) || !count(item.attemptsToday) || !count(item.uiObservedToday) ||
      !count(item.unresolvedAttempts) || item.uiObservedToday > item.attemptsToday) return null;
  return { dayKey: item.dayKey, attemptsToday: item.attemptsToday,
    uiObservedToday: item.uiObservedToday, unresolvedAttempts: item.unresolvedAttempts };
}

export function parseSmartSwipeHistory(value: unknown): SmartSwipeAttempt[] | null {
  if (!value || typeof value !== "object" ||
      !Array.isArray((value as { attempts?: unknown }).attempts)) return null;
  const attempts = (value as { attempts: unknown[] }).attempts;
  if (attempts.length > 30) return null;
  const parsed: SmartSwipeAttempt[] = [];
  for (const raw of attempts) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (!day(item.dayKey) ||
        !["reserved", "ui_observed", "uncertain"].includes(String(item.status)) ||
        typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) ||
        (item.resolvedAt !== null &&
          (typeof item.resolvedAt !== "string" || !Number.isFinite(Date.parse(item.resolvedAt))))) return null;
    parsed.push(item as unknown as SmartSwipeAttempt);
  }
  return parsed;
}

export function remainingSmartSwipeAttempts(summary: SmartSwipeAttemptSummary, cap: number): number | null {
  if (!Number.isSafeInteger(cap) || cap < 1) return null;
  return Math.max(0, cap - summary.attemptsToday);
}
