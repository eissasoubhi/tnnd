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
