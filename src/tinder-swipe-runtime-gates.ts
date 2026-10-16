import { planSmartRightSwipe, selectTinderActivity, type SmartAutoSwipeConfig, type SmartSwipeDailyProgress, type ManagedTinderActivity, type SwipePlanStatus } from "./tinder-smart-auto-swipe-policy";
import type { SwipeDiscoveryEvidence } from "./tinder-swipe-discovery-evidence";

export type SwipeRuntimeDecision = {
  activity: ManagedTinderActivity | null;
  swipeStatus: SwipePlanStatus | "wrong-route" | "unsafe-controls" | "not-verified";
  canExecuteLiveLike: false;
};

/** The runtime coordinator can select work but must never infer a confirmed Like from DOM snapshots. */
export function planSwipeRuntime(
  config: SmartAutoSwipeConfig,
  progress: SmartSwipeDailyProgress,
  evidence: SwipeDiscoveryEvidence,
  nowMs: number,
  timeZone: string,
  availability: {
    newMatchesAvailable: boolean;
    activeChatsAvailable: boolean;
    activeConversationInProgress: boolean;
    mandatoryStop: boolean;
  }
): SwipeRuntimeDecision {
  const routeOk = evidence.route === "recs";
  const controlsOk = evidence.status === "observed" && evidence.likeControls === 1 &&
    evidence.passControls === 1 && evidence.superLikeControls >= 1;
  const swipeStatus = !routeOk ? "wrong-route" : !controlsOk ? "unsafe-controls" :
    planSmartRightSwipe(config, progress, nowMs, timeZone, availability);
  const activity = selectTinderActivity(config, {
    ...availability,
    swipeSessionAvailable: swipeStatus === "ready",
  });
  return { activity, swipeStatus, canExecuteLiveLike: false };
}
