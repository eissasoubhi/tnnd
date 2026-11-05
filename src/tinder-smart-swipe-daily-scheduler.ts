import {
  beginSmartSwipeSession, finishSmartSwipeSession, MIN_SESSION_BREAK_MS,
  smartSwipeElapsedMs, tinderAccountDayKey, validateSmartAutoSwipeConfig,
  type SmartAutoSwipeConfig, type SmartSwipeDailyProgress
} from "./tinder-smart-auto-swipe-policy.ts";

/** A day is divided into session slots in the account's own timezone.
 * Skipped slots are not made up with a burst of back-to-back sessions.
 */
export interface ScheduledSwipeProgress extends SmartSwipeDailyProgress {
  lastSessionSlotIndex?: number;
}
export type SessionScheduleDecision = {
  action: "disabled" | "blocked" | "running" | "due" | "wait" | "end";
  reason: string;
  currentSlot: number | null;
  nextLocalMinute: number | null;
  remainingSessionMs: number | null;
};

export function accountMinuteOfDay(nowMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  const minute = Number(parts.find(p => p.type === "minute")?.value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("invalid_account_clock");
  return 60 * hour + minute;
}

export function scheduleSmartSwipeSession(
  config: SmartAutoSwipeConfig,
  progress: ScheduledSwipeProgress,
  nowMs: number,
  timeZone: string
): SessionScheduleDecision {
  if (!config.enabled) return { action: "disabled", reason: "disabled", currentSlot: null, nextLocalMinute: null, remainingSessionMs: null };
  if (validateSmartAutoSwipeConfig(config).length) return { action: "blocked", reason: "invalid_config", currentSlot: null, nextLocalMinute: null, remainingSessionMs: null };
  let minute: number;
  try {
    if (progress.dayKey !== tinderAccountDayKey(nowMs, timeZone))
      return { action: "blocked", reason: "stale_day", currentSlot: null, nextLocalMinute: null, remainingSessionMs: null };
    minute = accountMinuteOfDay(nowMs, timeZone);
  } catch {
    return { action: "blocked", reason: "invalid_account_time", currentSlot: null, nextLocalMinute: null, remainingSessionMs: null };
  }
  const slot = Math.min(config.sessionsPerDay - 1, Math.floor(minute * config.sessionsPerDay / 1440));
  const next = slot + 1 < config.sessionsPerDay
    ? Math.ceil((slot + 1) * 1440 / config.sessionsPerDay) : null;
  const result = (action: SessionScheduleDecision["action"], reason: string, remaining: number | null = null): SessionScheduleDecision =>
    ({ action, reason, currentSlot: slot, nextLocalMinute: next, remainingSessionMs: remaining });
  if (progress.rightSwipesReserved > 0) return result("blocked", "unresolved_attempt");
  // Continuous Swipe: legacy session slots, per-day counts, duration and
  // mandatory breaks are informational only. An explicit Start keeps Swipe
  // available until Stop, a real Tinder guard, or an unresolved attempt.
  if (progress.session)
    return result("running", progress.session.runningSinceMs === null ?
      "session_paused" : "session_active");
  return result("due", "continuous_swipe");
}

export function beginScheduledSwipeSession(
  config: SmartAutoSwipeConfig, progress: ScheduledSwipeProgress,
  nowMs: number, timeZone: string, random: () => number
): ScheduledSwipeProgress | null {
  const decision = scheduleSmartSwipeSession(config, progress, nowMs, timeZone);
  if (decision.action !== "due" || decision.currentSlot === null) return null;
  const started = beginSmartSwipeSession(config, progress, nowMs, timeZone, random);
  return started ? { ...started, lastSessionSlotIndex: decision.currentSlot } : null;
}

/** Only session boundaries should turn a session into a completed slot. */
export function closeExpiredScheduledSwipeSession(
  config: SmartAutoSwipeConfig, progress: ScheduledSwipeProgress, nowMs: number, timeZone: string
): ScheduledSwipeProgress {
  // Kept for old callers. Continuous mode never expires a healthy session.
  return progress;
}

/** On MV3 worker restart, freeze elapsed time rather than counting hours of idle time.
 * The caller must durably save the freeze before any subsequent resumed action.
 */
export function recoverPausedSwipeSession(
  progress: ScheduledSwipeProgress, lastHeartbeatMs: number, nowMs: number
): ScheduledSwipeProgress {
  const s = progress.session;
  if (!s || s.runningSinceMs === null) return progress;
  if (!Number.isFinite(lastHeartbeatMs) || lastHeartbeatMs < s.runningSinceMs ||
      lastHeartbeatMs > nowMs) return {
    ...progress, session: { ...s, runningSinceMs: null }
  };
  return {
    ...progress,
    session: {
      ...s,
      activeElapsedMs: s.activeElapsedMs + Math.min(s.durationMs, lastHeartbeatMs - s.runningSinceMs),
      runningSinceMs: null
    }
  };
}
