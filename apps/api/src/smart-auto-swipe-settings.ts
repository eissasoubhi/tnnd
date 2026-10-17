import { getPool } from "./db-client.js";

/** Configuration is not authorization to execute any Tinder operation. */
export type SwipeActivity = "swipe" | "new-match" | "active-chat";
export interface SmartSwipeSettings {
  enabled: boolean;
  sessionsPerDay: number;
  sessionDurationMinSeconds: number;
  sessionDurationMaxSeconds: number;
  swipeDelayMinSeconds: number;
  swipeDelayMaxSeconds: number;
  maxRightSwipesPerDay: number;
  priority: SwipeActivity[];
  pauseSwipeDuringActiveConversation: boolean;
  maxActiveChatSecondsPerConversationPerDay: number | null;
  timeZone: string;
}
export const DEFAULT_SMART_SWIPE: Readonly<SmartSwipeSettings> = {
  enabled: false,
  sessionsPerDay: 3,
  sessionDurationMinSeconds: 300,
  sessionDurationMaxSeconds: 600,
  swipeDelayMinSeconds: 2,
  swipeDelayMaxSeconds: 5,
  maxRightSwipesPerDay: 50,
  priority: ["swipe", "new-match", "active-chat"],
  pauseSwipeDuringActiveConversation: true,
  maxActiveChatSecondsPerConversationPerDay: null,
  timeZone: "UTC"
};
const activities: readonly SwipeActivity[] = ["swipe", "new-match", "active-chat"];
const keys = Object.keys(DEFAULT_SMART_SWIPE);
const safeInt = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= max;

export function defaultSmartSwipeSettings(): SmartSwipeSettings {
  return { ...DEFAULT_SMART_SWIPE, priority: [...DEFAULT_SMART_SWIPE.priority] };
}
export function validateSmartSwipeSettings(value: unknown):
  { ok: true; settings: SmartSwipeSettings } | { ok: false; errors: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, errors: ["settings_must_be_object"] };
  const v = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(v)) if (!keys.includes(key)) errors.push("unknown_setting:" + key);
  if (typeof v.enabled !== "boolean") errors.push("enabled");
  if (!safeInt(v.sessionsPerDay, 24)) errors.push("sessionsPerDay");
  if (!safeInt(v.sessionDurationMinSeconds, 86400)) errors.push("sessionDurationMinSeconds");
  if (!safeInt(v.sessionDurationMaxSeconds, 86400)) errors.push("sessionDurationMaxSeconds");
  if (typeof v.sessionDurationMinSeconds === "number" &&
      typeof v.sessionDurationMaxSeconds === "number" &&
      v.sessionDurationMinSeconds > v.sessionDurationMaxSeconds) errors.push("sessionDurationRange");
  if (!safeInt(v.swipeDelayMinSeconds, 3600)) errors.push("swipeDelayMinSeconds");
  if (!safeInt(v.swipeDelayMaxSeconds, 3600)) errors.push("swipeDelayMaxSeconds");
  if (typeof v.swipeDelayMinSeconds === "number" &&
      typeof v.swipeDelayMaxSeconds === "number" &&
      v.swipeDelayMinSeconds > v.swipeDelayMaxSeconds) errors.push("swipeDelayRange");
  if (!safeInt(v.maxRightSwipesPerDay, 1000)) errors.push("maxRightSwipesPerDay");
  if (!Array.isArray(v.priority) || v.priority.length !== 3 ||
      new Set(v.priority).size !== 3 ||
      !v.priority.every(x => typeof x === "string" && activities.includes(x as SwipeActivity)))
    errors.push("priority");
  if (typeof v.pauseSwipeDuringActiveConversation !== "boolean")
    errors.push("pauseSwipeDuringActiveConversation");
  if (v.maxActiveChatSecondsPerConversationPerDay !== null &&
      !safeInt(v.maxActiveChatSecondsPerConversationPerDay, 86400))
    errors.push("maxActiveChatSecondsPerConversationPerDay");
  if (typeof v.timeZone !== "string" || v.timeZone.length > 80 || !v.timeZone) errors.push("timeZone");
  else {
    try { new Intl.DateTimeFormat("en-US", { timeZone: v.timeZone }); }
    catch { errors.push("timeZone"); }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, settings: v as unknown as SmartSwipeSettings };
}

export interface SmartSwipeSettingsResponse {
  settings: SmartSwipeSettings;
  updatedAt: string | null;
  liveExecutionAvailable: false;
  unavailableReason: "runtime_not_implemented";
}
const nonOperational = {
  liveExecutionAvailable: false,
  unavailableReason: "runtime_not_implemented"
} as const;

export async function getSmartSwipeSettings(userId: string): Promise<SmartSwipeSettingsResponse> {
  const result = await getPool().query<{ settings_json: unknown; updated_at: Date }>(
    "SELECT settings_json, updated_at FROM user_smart_auto_swipe_settings WHERE user_id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row) return { settings: defaultSmartSwipeSettings(), updatedAt: null, ...nonOperational };
  const valid = validateSmartSwipeSettings(row.settings_json);
  if (!valid.ok) throw new Error("invalid_persisted_smart_swipe_settings");
  return { settings: valid.settings, updatedAt: row.updated_at.toISOString(), ...nonOperational };
}

export async function putSmartSwipeSettings(
  userId: string, settings: SmartSwipeSettings
): Promise<SmartSwipeSettingsResponse> {
  const valid = validateSmartSwipeSettings(settings);
  if (!valid.ok) throw new Error("invalid_smart_swipe_settings");
  const query = "INSERT INTO user_smart_auto_swipe_settings (user_id, settings_json) " +
    "VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO UPDATE SET " +
    "settings_json = EXCLUDED.settings_json, updated_at = now() RETURNING updated_at";
  const result = await getPool().query<{ updated_at: Date }>(
    query, [userId, JSON.stringify(valid.settings)]
  );
  const timestamp = result.rows[0]?.updated_at;
  if (!timestamp) throw new Error("smart_swipe_settings_save_failed");
  return { settings: valid.settings, updatedAt: timestamp.toISOString(), ...nonOperational };
}
