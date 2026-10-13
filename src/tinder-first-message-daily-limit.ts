/** Per-day opener cap shared by existing matches, future matches and single-chat starts.
 * A profile/extension upgrade without this setting keeps the historical default of five.
 * Count durable claims (not just confirmed Tinder deliveries) to avoid accidental retries.
 */
export const DEFAULT_FIRST_MESSAGE_DAILY_LIMIT = 5;
export const MAX_FIRST_MESSAGE_DAILY_LIMIT = 100;

export function firstMessageDailyLimit(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= 1 && value <= MAX_FIRST_MESSAGE_DAILY_LIMIT
    ? value : DEFAULT_FIRST_MESSAGE_DAILY_LIMIT;
}

export function firstMessageClaimsToday(claims: Record<string, number>, now = Date.now()): number {
  if (!Number.isFinite(now)) return 0;
  const date = new Date(now).toISOString().slice(0, 10);
  return Object.values(claims).filter(timestamp => {
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return false;
    const claimedAt = new Date(timestamp);
    return Number.isFinite(claimedAt.getTime()) && claimedAt.toISOString().slice(0, 10) === date;
  }).length;
}

export function hasReachedFirstMessageDailyLimit(claims: Record<string, number>, value: unknown, now = Date.now()): boolean {
  return firstMessageClaimsToday(claims, now) >= firstMessageDailyLimit(value);
}
