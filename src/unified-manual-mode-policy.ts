import { tinderAccountDayKey } from "./tinder-smart-auto-swipe-policy.ts";
import { validSmartSwipeProgress } from "./tinder-smart-swipe-progress-store.ts";
import { verifiedDailyQuota } from "./unified-quota-status.ts";
import type { ManagedTinderActivity } from "./tinder-smart-auto-swipe-policy.ts";

/** A launcher selection changes activity, never user permissions or daily limits. */
export function manualActivity(value: unknown): ManagedTinderActivity | null {
  return value === "swipe" || value === "new-match" || value === "active-chat" ? value : null;
}

export function watcherSwitchSafety(value: unknown, nowMs = Date.now()): {
  allowed: boolean; reason?: string
} {
  if (!value || typeof value !== "object") return { allowed: false, reason: "État des conversations indisponible." };
  const state = value as {
    enabled?: unknown; phase?: unknown; phaseDetail?: unknown;
    matchPhase?: unknown; activeConversationRef?: unknown; activeConversationUntil?: unknown
  };
  if (state.enabled !== true) return { allowed: false, reason: "Le watcher n'est plus actif." };
  if (state.matchPhase !== "idle")
    return { allowed: false, reason: "Vérification ou envoi Match en cours. Réessaie après cette étape." };
  if (["loading", "incoming", "generating", "sending"].includes(String(state.phase)) ||
      (state.phase === "waiting" &&
        typeof state.phaseDetail === "string" &&
        state.phaseDetail.startsWith("Unanswered incoming message found")))
    return { allowed: false, reason: "Réponse ou changement de conversation en cours. Réessaie après confirmation." };
  if (typeof state.activeConversationRef === "string" &&
      typeof state.activeConversationUntil === "string" &&
      Date.parse(state.activeConversationUntil) > nowMs)
    return { allowed: false, reason: "Conversation active : attends la fin de sa fenêtre de suivi avant de changer de mode." };
  return { allowed: true };
}

/** A manual Swipe handoff can happen below the quota only if both local and
 * server attempt ledgers are fully settled for this account-day. A check
 * before Stop must always be repeated AFTER durable disarm.
 */
export function manualSwipeReleaseSafe(
  settings: { maxRightSwipesPerDay: number; timeZone: string },
  serverSummary: unknown, localProgress: unknown, nowMs = Date.now()
): boolean {
  const quota = verifiedDailyQuota(settings, serverSummary, nowMs);
  if (!quota || !serverSummary || typeof serverSummary !== "object") return false;
  let accountDay: string;
  try { accountDay = tinderAccountDayKey(nowMs, settings.timeZone); }
  catch { return false; }
  const unresolved = (serverSummary as { unresolvedAttempts?: unknown }).unresolvedAttempts;
  return quota.dayKey === accountDay &&
    unresolved === 0 &&
    validSmartSwipeProgress(localProgress) &&
    localProgress.dayKey === accountDay &&
    localProgress.rightSwipesReserved === 0;
}
