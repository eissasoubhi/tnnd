import {
  validateSmartAutoSwipeConfig, type SmartAutoSwipeConfig
} from "./tinder-smart-auto-swipe-policy";

/** Validate API compatibility without quietly authorizing missing priorities,
 * invalid consent, missing time zone or changed session / swipe constraints.
 *
 * Pre-v0.2.40 APIs may return a LEGACY positive daily Like cap; new TNND
 * explicitly does not apply that app-defined limit. The backend already
 * normalizes it on both PUT and GET. This adapter accepts ONLY that one
 * backward-compatible legacy field until the backend is upgraded.
 */
export type UnifiedWebSettings = SmartAutoSwipeConfig & { timeZone: string };
export type UnifiedWebSettingsResult =
  | { ok: true; settings: UnifiedWebSettings; legacyDailyLikeCap: boolean }
  | { ok: false; errors: string[] };

export function parseUnifiedWebSettings(payload: unknown): UnifiedWebSettingsResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false, errors: ["server_response"] };
  const raw = (payload as Record<string, unknown>).settings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, errors: ["settings_missing"] };
  const settings = raw as Record<string, unknown>;
  const legacy = settings.maxRightSwipesPerDay;
  const legacyDailyLikeCap = typeof legacy === "number" &&
    Number.isSafeInteger(legacy) && legacy >= 1 && legacy <= 1000;
  const candidate: Record<string, unknown> = {
    ...settings,
    ...(legacyDailyLikeCap ? { maxRightSwipesPerDay: null } : {})
  };
  const errors = validateSmartAutoSwipeConfig(candidate as unknown as SmartAutoSwipeConfig);
  // Every Like ledger/day and session check needs the backend's *actual*
  // account timezone. Never fabricate a timezone to make validation pass.
  if (typeof settings.timeZone !== "string" ||
      !settings.timeZone || settings.timeZone.length > 80) errors.push("timeZone");
  else {
    try { new Intl.DateTimeFormat("en-US", { timeZone: settings.timeZone }); }
    catch { errors.push("timeZone"); }
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, settings: candidate as UnifiedWebSettings, legacyDailyLikeCap };
}

const labels: Readonly<Record<string,string>> = {
  server_response: "réponse du serveur",
  settings_missing: "paramètres absents",
  enabled: "activation",
  sessionsPerDay: "nombre de sessions",
  sessionDurationMinSeconds: "durée minimale de session",
  sessionDurationMaxSeconds: "durée maximale de session",
  sessionDurationRange: "durée des sessions",
  swipeDelayMinSeconds: "délai minimal entre Likes",
  swipeDelayMaxSeconds: "délai maximal entre Likes",
  swipeDelayRange: "intervalle entre Likes",
  maxRightSwipesPerDay: "ancien plafond quotidien de Likes",
  priority: "ordre des activités Swipe / Matches / Chat",
  pauseSwipeDuringActiveConversation: "pause Swipe pendant un chat actif",
  maxActiveChatSecondsPerConversationPerDay: "durée de chat par conversation",
  timeZone: "fuseau horaire du compte"
};
export function explainUnifiedWebSettingsErrors(errors: readonly string[]): string {
  const fields = [...new Set(errors)].slice(0, 4).map(field => labels[field] ?? "champ de configuration inconnu");
  return "Configuration TNND Web incompatible : " + fields.join(", ") +
    ". Vérifie ces réglages dans TNND Web, enregistre-les puis redémarre l’API si elle n’est pas à jour. Aucune activité démarrée.";
}
