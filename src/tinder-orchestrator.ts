import { planNavigation, type TinderJobKind, type TinderNavigationPlan, type TinderUiStateSnapshot } from "./tinder-state-machine";

export interface TinderJobDecision {
  allowed: boolean;
  reason: string;
  navigation: TinderNavigationPlan;
}

export function planBoundedTinderJob(
  current: TinderUiStateSnapshot,
  job: TinderJobKind,
  conversationRef?: string
): TinderJobDecision {
  const navigation = planNavigation(current, job, conversationRef);

  if (job === "sync-only") {
    return {
      allowed: true,
      reason: "sync-only does not execute a bounded Tinder action",
      navigation
    };
  }

  if (current.overlay === "blocking-modal" || !current.boundedActionAllowed) {
    return {
      allowed: false,
      reason: current.overlay === "blocking-modal"
        ? "visible blocking overlay must be resolved before Tinder work"
        : "current Tinder state is not safe for bounded actions",
      navigation: { ...navigation, path: null }
    };
  }

  if (current.state === "unknown") {
    return {
      allowed: false,
      reason: "unknown Tinder state requires observation before navigation",
      navigation: { ...navigation, path: null }
    };
  }

  if (job === "process-thread" && current.state !== "conversation" && !conversationRef?.trim()) {
    return {
      allowed: false,
      reason: "thread work requires a resolved conversation reference",
      navigation: { ...navigation, path: null }
    };
  }

  return {
    allowed: true,
    reason: navigation.path ? "bounded navigation is required before the job" : "current Tinder state can execute the job",
    navigation
  };
}
