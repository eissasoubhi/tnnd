import { remainingChatSeconds, tinderAccountDayKey, type SmartAutoSwipeConfig } from "./tinder-smart-auto-swipe-policy.ts";

/** Browser-worker restarts and idle gaps never silently consume chat attention. */
export const FOCUS_HEARTBEAT_MAX_MS = 30_000;
export const FOCUS_HISTORY_LIMIT = 500;
export interface ConversationFocusLedger {
  schemaVersion: 1;
  dayKey: string;
  spentMsByThread: Record<string, number>;
  activeThread: string | null;
  lastHeartbeatAtMs: number | null;
}
export function emptyConversationFocusLedger(dayKey: string): ConversationFocusLedger {
  return { schemaVersion: 1, dayKey, spentMsByThread: {}, activeThread: null, lastHeartbeatAtMs: null };
}
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export function validConversationFocusLedger(value: unknown): value is ConversationFocusLedger {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ConversationFocusLedger>;
  if (v.schemaVersion !== 1 || typeof v.dayKey !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(v.dayKey) ||
      (v.activeThread !== null && typeof v.activeThread !== "string") ||
      (v.lastHeartbeatAtMs !== null && !nonnegative(v.lastHeartbeatAtMs)) ||
      !v.spentMsByThread || typeof v.spentMsByThread !== "object" ||
      Array.isArray(v.spentMsByThread)) return false;
  const items = Object.entries(v.spentMsByThread);
  return items.length <= FOCUS_HISTORY_LIMIT &&
    items.every(([key, elapsed]) => key.length >= 1 && key.length <= 512 && nonnegative(elapsed));
}

/** Unknown/corrupt data blocks automation; it cannot become a free daily budget. */
export function readConversationFocusLedger(
  raw: unknown, nowMs: number, timeZone: string
): ConversationFocusLedger | null {
  let dayKey: string;
  try { dayKey = tinderAccountDayKey(nowMs, timeZone); }
  catch { return null; }
  if (raw === undefined) return emptyConversationFocusLedger(dayKey);
  if (!validConversationFocusLedger(raw)) return null;
  return raw.dayKey !== dayKey ? emptyConversationFocusLedger(dayKey) : raw;
}

export function stopConversationFocus(
  ledger: ConversationFocusLedger
): ConversationFocusLedger {
  return { ...ledger, activeThread: null, lastHeartbeatAtMs: null };
}

export function startConversationFocus(
  ledger: ConversationFocusLedger, thread: string, nowMs: number
): ConversationFocusLedger | null {
  if (!thread || thread.length > 512 || !nonnegative(nowMs)) return null;
  return {
    ...ledger, activeThread: thread,
    lastHeartbeatAtMs: nowMs
  };
}

/** Only observed time with repeated heartbeats is charged.
 * An idle gap >30s is NOT charged beyond 30 seconds, and the old start
 * is never reused. A tab switch ends focus via stopConversationFocus().
 */
export function heartbeatConversationFocus(
  ledger: ConversationFocusLedger,
  thread: string, nowMs: number,
  config: SmartAutoSwipeConfig
): ConversationFocusLedger {
  if (!ledger.activeThread || ledger.activeThread !== thread ||
      ledger.lastHeartbeatAtMs === null || !nonnegative(nowMs) ||
      nowMs < ledger.lastHeartbeatAtMs) return stopConversationFocus(ledger);
  const elapsed = Math.min(FOCUS_HEARTBEAT_MAX_MS, nowMs - ledger.lastHeartbeatAtMs);
  const prior = ledger.spentMsByThread[thread] ?? 0;
  const limit = config.maxActiveChatSecondsPerConversationPerDay;
  const remaining = limit === null ? Number.POSITIVE_INFINITY
    : Math.max(0, limit * 1000 - prior);
  const consumed = Math.min(elapsed, remaining);
  return {
    ...ledger,
    spentMsByThread: { ...ledger.spentMsByThread, [thread]: prior + consumed },
    lastHeartbeatAtMs: nowMs,
    activeThread: limit !== null && consumed < elapsed ? null : thread
  };
}

export function remainingConversationFocusSeconds(
  ledger: ConversationFocusLedger, thread: string, config: SmartAutoSwipeConfig
): number {
  if (!thread || thread.length > 512) return 0;
  return remainingChatSeconds(config, (ledger.spentMsByThread[thread] ?? 0) / 1000);
}

export function canFocusConversation(
  ledger: ConversationFocusLedger, thread: string, config: SmartAutoSwipeConfig
): boolean {
  return remainingConversationFocusSeconds(ledger, thread, config) > 0;
}
