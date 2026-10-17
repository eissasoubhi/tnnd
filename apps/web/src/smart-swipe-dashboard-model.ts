/** The server ledger tracks attempts, not Tinder acceptance receipts.
 * Never label a changed Tinder card as a confirmed platform Like.
 */
export interface SmartSwipeAttemptSummary {
  dayKey: string;
  attemptsToday: number;
  uiObservedToday: number;
  unresolvedAttempts: number;
}

export function parseSmartSwipeAttemptSummary(value: unknown): SmartSwipeAttemptSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const integer = (v: unknown): v is number =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  if (typeof data.dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.dayKey) ||
      !integer(data.attemptsToday) || !integer(data.uiObservedToday) ||
      !integer(data.unresolvedAttempts) ||
      data.uiObservedToday > data.attemptsToday) return null;
  return {
    dayKey: data.dayKey,
    attemptsToday: data.attemptsToday,
    uiObservedToday: data.uiObservedToday,
    unresolvedAttempts: data.unresolvedAttempts
  };
}

export function remainingSmartSwipeAttempts(
  summary: SmartSwipeAttemptSummary, dailyLimit: number
): number {
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) return 0;
  return Math.max(0, dailyLimit - summary.attemptsToday);
}

export function smartSwipeLedgerNotice(summary: SmartSwipeAttemptSummary): string {
  if (summary.unresolvedAttempts > 0)
    return "Action(s) incertaine(s) : arrêt des nouveaux Likes jusqu’à vérification manuelle.";
  return "Progression de carte observée uniquement ; acceptation par Tinder non vérifiée.";
}
