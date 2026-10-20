import { validateSmartAutoSwipeConfig, type SmartAutoSwipeConfig,
  type ManagedTinderActivity } from "./tinder-smart-auto-swipe-policy";

/** Phase 1: choose an initial eligible engine. This selector does NOT claim
 * dynamic rescheduling or availability of new messages; those require an
 * explicit next phase with observed queues and handoff tests.
 */
export function initialUnifiedActivity(
  config: SmartAutoSwipeConfig, availability: {
    discoveryVisible: boolean;
    automaticRepliesEnabled: boolean;
    tinderTabPresent: boolean;
  }
): ManagedTinderActivity | null {
  if (!availability.tinderTabPresent ||
      !config.enabled || validateSmartAutoSwipeConfig(config).length) return null;
  for (const activity of config.priority) {
    if (activity === "swipe" && availability.discoveryVisible) return "swipe";
    if ((activity === "active-chat" || activity === "new-match") &&
        availability.automaticRepliesEnabled) return activity;
  }
  return null;
}


/** These errors refer exclusively to an older, unresolved Like in the
 * account's durable journal or to its matching local reservation. They must
 * NEVER be interpreted as permission to retry/erase that Like.
 *
 * Other failures (offline API, lost ownership, Stop, unknown worker failure)
 * may be in-flight actions, so we refuse to switch automatically.
 */
const PAUSABLE_SWIPE_LEDGER_REASONS = new Set([
  "server_attempt_unresolved",
  "unresolved_attempt_requires_review",
  "reservation_day_mismatch",
  "reservation_count_mismatch",
  "server_attempts_not_fully_resolved",
  "local_observed_count_mismatch",
  "local_attempt_count_exceeds_server",
  "corrupt_local_progress_requires_review"
]);
export function isPausableSwipeLedgerReason(reason: unknown): boolean {
  return typeof reason === "string" && PAUSABLE_SWIPE_LEDGER_REASONS.has(reason);
}

/** Fallback means the unified controller may keep *other authorized work*
 * available; it cannot continue or replay an uncertain Tinder Like.
 * Return only a lower-ranked activity, never skip independent permissions.
 */
export function fallbackAfterBlockedSwipe(
  config: SmartAutoSwipeConfig,
  reason: unknown,
  automaticRepliesEnabled: boolean
): Extract<ManagedTinderActivity, "active-chat" | "new-match"> | null {
  if (!isPausableSwipeLedgerReason(reason) || !automaticRepliesEnabled ||
      !config.enabled || validateSmartAutoSwipeConfig(config).length) return null;
  const swipeIndex = config.priority.indexOf("swipe");
  if (swipeIndex === -1) return null;
  for (const activity of config.priority.slice(swipeIndex + 1)) {
    if (activity === "active-chat" || activity === "new-match") return activity;
  }
  return null;
}
