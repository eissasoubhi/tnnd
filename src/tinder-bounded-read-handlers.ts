import { TinderDomAdapter } from "./tinder-adapter";
import type { TinderScheduledJob } from "./tinder-scheduler";
import type { TinderUiStateSnapshot } from "./tinder-state-machine";

export interface TinderBoundedReadResult {
  completed: boolean;
  kind: TinderScheduledJob["kind"];
  observation: Record<string, unknown>;
}

export function executeBoundedTinderRead(
  adapter: TinderDomAdapter,
  job: TinderScheduledJob,
  state: TinderUiStateSnapshot
): TinderBoundedReadResult {
  if (job.kind === "sync-only") {
    return { completed: true, kind: job.kind, observation: { state: state.route.state, path: state.path } };
  }

  if (job.kind === "scan-inbox") {
    const diagnostics = adapter.diagnose();
    return {
      completed: state.route.state === "inbox",
      kind: job.kind,
      observation: {
        state: state.route.state,
        sidebarState: diagnostics.sidebarState,
        visibleCandidateCount: diagnostics.visibleCandidateCount,
        viewConfidence: diagnostics.viewConfidence,
        viewConfidenceLabel: diagnostics.viewConfidenceLabel
      }
    };
  }

  if (job.kind === "process-thread") {
    const snapshot = adapter.read();
    return {
      completed: state.route.state === "conversation" && Boolean(snapshot),
      kind: job.kind,
      observation: snapshot
        ? {
            threadKeyHash: adapter.diagnose().threadKeyHash,
            latestIncomingKey: snapshot.latestIncomingKey,
            hasConversationContext: Boolean(snapshot.context)
          }
        : { hasConversationContext: false }
    };
  }

  return {
    completed: false,
    kind: job.kind,
    observation: { reason: "swipe_requires_explicit_bounded_action_handler" }
  };
}
