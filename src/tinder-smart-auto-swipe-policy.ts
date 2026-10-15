/** Pure policy only. Does NOT interact with Tinder or authorize live Likes.
 * Existing connection/consent/verification gates remain mandatory.
 */
export type ManagedTinderActivity = "swipe" | "new-match" | "active-chat";

export interface SmartAutoSwipeConfig {
  enabled: boolean;
  sessionsPerDay: number;
  sessionDurationMinSeconds: number;
  sessionDurationMaxSeconds: number;
  swipeDelayMinSeconds: number;
  swipeDelayMaxSeconds: number;
  maxRightSwipesPerDay: number;
  priority: readonly ManagedTinderActivity[];
  pauseSwipeDuringActiveConversation: boolean;
  /** Null is unlimited. Per conversation, not a global chat quota. */
  maxActiveChatSecondsPerConversationPerDay: number | null;
}

export const DEFAULT_SMART_AUTO_SWIPE_CONFIG: Readonly<SmartAutoSwipeConfig> = {
  enabled: false,
  sessionsPerDay: 3,
  sessionDurationMinSeconds: 300,
  sessionDurationMaxSeconds: 600,
  swipeDelayMinSeconds: 2,
  swipeDelayMaxSeconds: 5,
  maxRightSwipesPerDay: 50,
  priority: ["swipe", "new-match", "active-chat"],
  pauseSwipeDuringActiveConversation: true,
  maxActiveChatSecondsPerConversationPerDay: null
};

const ACTIVITIES: readonly ManagedTinderActivity[] = ["swipe", "new-match", "active-chat"];
const POSITIVE_SAFE_INTEGER = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Invalid or missing settings never silently become permissive. */
export function validateSmartAutoSwipeConfig(config: SmartAutoSwipeConfig): string[] {
  const errors: string[] = [];
  if (typeof config.enabled !== "boolean") errors.push("enabled");
  if (!POSITIVE_SAFE_INTEGER(config.sessionsPerDay)) errors.push("sessionsPerDay");
  if (!POSITIVE_SAFE_INTEGER(config.sessionDurationMinSeconds)) errors.push("sessionDurationMinSeconds");
  if (!POSITIVE_SAFE_INTEGER(config.sessionDurationMaxSeconds)) errors.push("sessionDurationMaxSeconds");
  if (config.sessionDurationMinSeconds > config.sessionDurationMaxSeconds) errors.push("sessionDurationRange");
  if (!POSITIVE_SAFE_INTEGER(config.swipeDelayMinSeconds)) errors.push("swipeDelayMinSeconds");
  if (!POSITIVE_SAFE_INTEGER(config.swipeDelayMaxSeconds)) errors.push("swipeDelayMaxSeconds");
  if (config.swipeDelayMinSeconds > config.swipeDelayMaxSeconds) errors.push("swipeDelayRange");
  if (!POSITIVE_SAFE_INTEGER(config.maxRightSwipesPerDay)) errors.push("maxRightSwipesPerDay");
  if (!Array.isArray(config.priority) || config.priority.length !== 3 ||
      new Set(config.priority).size !== 3 || !config.priority.every(v => ACTIVITIES.includes(v)))
    errors.push("priority");
  if (typeof config.pauseSwipeDuringActiveConversation !== "boolean")
    errors.push("pauseSwipeDuringActiveConversation");
  if (config.maxActiveChatSecondsPerConversationPerDay !== null &&
      !POSITIVE_SAFE_INTEGER(config.maxActiveChatSecondsPerConversationPerDay))
    errors.push("maxActiveChatSecondsPerConversationPerDay");
  return errors;
}

/** Injectable RNG is for deterministic tests; timings are workload controls,
 * not a way to disguise automated activity or bypass Tinder's protections.
 */
export function sampleInclusiveInteger(min: number, max: number, random: () => number): number {
  if (!POSITIVE_SAFE_INTEGER(min) || !POSITIVE_SAFE_INTEGER(max) || min > max)
    throw new Error("invalid_random_range");
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error("invalid_random_value");
  return min + Math.floor(Math.min(value, 1 - Number.EPSILON) * (max - min + 1));
}

/** A running swipe session stays selected even during its inter-swipe delay.
 * Mandatory stop gates must be applied by the caller before this selector.
 */
export function selectTinderActivity(
  config: SmartAutoSwipeConfig,
  options: {
    swipeSessionAvailable: boolean;
    newMatchesAvailable: boolean;
    activeChatsAvailable: boolean;
    activeConversationInProgress: boolean;
    mandatoryStop: boolean;
  }
): ManagedTinderActivity | null {
  if (validateSmartAutoSwipeConfig(config).length || options.mandatoryStop) return null;
  const pending: Record<ManagedTinderActivity, boolean> = {
    swipe: config.enabled && options.swipeSessionAvailable &&
      !(config.pauseSwipeDuringActiveConversation && options.activeConversationInProgress),
    "new-match": options.newMatchesAvailable,
    "active-chat": options.activeChatsAvailable
  };
  if (config.pauseSwipeDuringActiveConversation && options.activeConversationInProgress &&
      options.activeChatsAvailable) return "active-chat";
  return config.priority.find(activity => pending[activity]) ?? null;
}

/** Store separate focus counters by chat ref + local date. Never count idle time. */
export function remainingChatSeconds(config: SmartAutoSwipeConfig, focusedSecondsToday: number): number {
  if (!Number.isFinite(focusedSecondsToday) || focusedSecondsToday < 0) return 0;
  const maximum = config.maxActiveChatSecondsPerConversationPerDay;
  return maximum === null ? Number.POSITIVE_INFINITY : Math.max(0, maximum - focusedSecondsToday);
}

/** Always use an explicit account timezone. An invalid timezone fails closed. */
export function tinderAccountDayKey(nowMs: number, timeZone: string): string {
  if (!Number.isFinite(nowMs) || !timeZone.trim()) throw new Error("invalid_account_time");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(nowMs));
  const read = (part: string) => parts.find(item => item.type === part)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export interface SmartSwipeSession {
  durationMs: number;
  /** Accrued only while actually working, not while paused. */
  activeElapsedMs: number;
  runningSinceMs: number | null;
  nextRightSwipeNotBeforeMs: number | null;
}

export interface SmartSwipeDailyProgress {
  dayKey: string;
  startedSessions: number;
  rightSwipesConfirmed: number;
  /** Uncertain Tinder outcomes remain reserved, never replay automatically. */
  rightSwipesReserved: number;
  lastSessionEndedAtMs: number | null;
  session: SmartSwipeSession | null;
}

export const MIN_SESSION_BREAK_MS = 15 * 60_000;

export function emptySmartSwipeDay(dayKey: string): SmartSwipeDailyProgress {
  return {
    dayKey, startedSessions: 0, rightSwipesConfirmed: 0,
    rightSwipesReserved: 0, lastSessionEndedAtMs: null, session: null
  };
}

/** Return null for unresolved reservations, rather than losing them at midnight. */
export function rolloverSmartSwipeDay(
  state: SmartSwipeDailyProgress, nowMs: number, timeZone: string
): SmartSwipeDailyProgress | null {
  const dayKey = tinderAccountDayKey(nowMs, timeZone);
  if (state.dayKey === dayKey) return state;
  if (state.rightSwipesReserved > 0) return null;
  return emptySmartSwipeDay(dayKey);
}

export function smartSwipeElapsedMs(session: SmartSwipeSession, nowMs: number): number {
  const current = session.runningSinceMs === null ? 0 : Math.max(0, nowMs - session.runningSinceMs);
  return session.activeElapsedMs + current;
}

export function beginSmartSwipeSession(
  config: SmartAutoSwipeConfig,
  progress: SmartSwipeDailyProgress,
  nowMs: number,
  timeZone: string,
  random: () => number = Math.random
): SmartSwipeDailyProgress | null {
  if (!config.enabled || validateSmartAutoSwipeConfig(config).length ||
      progress.dayKey !== tinderAccountDayKey(nowMs, timeZone) ||
      progress.session !== null || progress.rightSwipesReserved > 0 ||
      progress.startedSessions >= config.sessionsPerDay ||
      progress.rightSwipesConfirmed >= config.maxRightSwipesPerDay ||
      (progress.lastSessionEndedAtMs !== null &&
        nowMs - progress.lastSessionEndedAtMs < MIN_SESSION_BREAK_MS)) return null;
  const durationSeconds = sampleInclusiveInteger(
    config.sessionDurationMinSeconds, config.sessionDurationMaxSeconds, random
  );
  return {
    ...progress,
    startedSessions: progress.startedSessions + 1,
    session: {
      durationMs: durationSeconds * 1000, activeElapsedMs: 0,
      runningSinceMs: nowMs, nextRightSwipeNotBeforeMs: null
    }
  };
}

export function pauseSmartSwipeSession(progress: SmartSwipeDailyProgress, nowMs: number): SmartSwipeDailyProgress {
  if (!progress.session || progress.session.runningSinceMs === null) return progress;
  return {
    ...progress, session: {
      ...progress.session,
      activeElapsedMs: smartSwipeElapsedMs(progress.session, nowMs),
      runningSinceMs: null
    }
  };
}

export function resumeSmartSwipeSession(progress: SmartSwipeDailyProgress, nowMs: number): SmartSwipeDailyProgress {
  if (!progress.session || progress.session.runningSinceMs !== null ||
      progress.session.activeElapsedMs >= progress.session.durationMs) return progress;
  return { ...progress, session: { ...progress.session, runningSinceMs: nowMs } };
}

export function finishSmartSwipeSession(progress: SmartSwipeDailyProgress, nowMs: number): SmartSwipeDailyProgress {
  return { ...progress, session: null, lastSessionEndedAtMs: nowMs };
}

export type SwipePlanStatus =
  | "ready" | "disabled" | "invalid-config" | "mandatory-stop" | "paused-for-chat"
  | "no-session" | "daily-cap" | "session-expired" | "session-paused"
  | "swipe-delay" | "unresolved-attempt" | "stale-day";

export function planSmartRightSwipe(
  config: SmartAutoSwipeConfig,
  progress: SmartSwipeDailyProgress,
  nowMs: number,
  timeZone: string,
  options: { activeConversationInProgress: boolean; mandatoryStop: boolean }
): SwipePlanStatus {
  if (validateSmartAutoSwipeConfig(config).length) return "invalid-config";
  if (!config.enabled) return "disabled";
  if (options.mandatoryStop) return "mandatory-stop";
  if (config.pauseSwipeDuringActiveConversation && options.activeConversationInProgress) return "paused-for-chat";
  if (progress.dayKey !== tinderAccountDayKey(nowMs, timeZone)) return "stale-day";
  if (progress.rightSwipesConfirmed + progress.rightSwipesReserved >= config.maxRightSwipesPerDay)
    return "daily-cap";
  if (progress.rightSwipesReserved > 0) return "unresolved-attempt";
  const session = progress.session;
  if (!session) return "no-session";
  if (smartSwipeElapsedMs(session, nowMs) >= session.durationMs) return "session-expired";
  if (session.runningSinceMs === null) return "session-paused";
  if (session.nextRightSwipeNotBeforeMs !== null && nowMs < session.nextRightSwipeNotBeforeMs)
    return "swipe-delay";
  return "ready";
}

/** Claim before any irreversible action; ambiguous outcomes block subsequent ones. */
export function reserveSmartRightSwipe(
  config: SmartAutoSwipeConfig,
  progress: SmartSwipeDailyProgress,
  nowMs: number,
  timeZone: string,
  random: () => number,
  options: { activeConversationInProgress: boolean; mandatoryStop: boolean }
): SmartSwipeDailyProgress | null {
  if (planSmartRightSwipe(config, progress, nowMs, timeZone, options) !== "ready" || !progress.session)
    return null;
  const delaySeconds = sampleInclusiveInteger(config.swipeDelayMinSeconds, config.swipeDelayMaxSeconds, random);
  return {
    ...progress,
    rightSwipesReserved: progress.rightSwipesReserved + 1,
    session: { ...progress.session, nextRightSwipeNotBeforeMs: nowMs + delaySeconds * 1000 }
  };
}

/** Only reliable UI confirmation advances the confirmed counter.
 * An uncertain result stays reserved, pending manual reconciliation.
 */
export function confirmSmartRightSwipe(
  progress: SmartSwipeDailyProgress, confirmed: boolean
): SmartSwipeDailyProgress {
  if (!confirmed || progress.rightSwipesReserved < 1) return progress;
  return {
    ...progress,
    rightSwipesConfirmed: progress.rightSwipesConfirmed + 1,
    rightSwipesReserved: progress.rightSwipesReserved - 1
  };
}
