import { TinderDomAdapter } from "./tinder-adapter";
import type { TinderScheduledJob } from "./tinder-scheduler";
import type { TinderUiStateSnapshot } from "./tinder-state-machine";
import { buildUnreadProcessThreadJobs, discoverUnreadThreadCandidates } from "./tinder-unread-queue";

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
    return { completed: true, kind: job.kind, observation: { state: state.state, path: state.path } };
  }

  if (job.kind === "scan-inbox") {
    const diagnostics = adapter.diagnose();
    const unreadCandidates = state.state === "inbox" ? discoverUnreadThreadCandidates() : [];
    const queuedJobs = buildUnreadProcessThreadJobs(unreadCandidates);
    return {
      completed: state.state === "inbox",
      kind: job.kind,
      observation: {
        state: state.state,
        sidebarState: diagnostics.sidebarState,
        visibleCandidateCount: diagnostics.visibleCandidateCount,
        viewConfidence: diagnostics.viewConfidence,
        viewConfidenceLabel: diagnostics.viewConfidenceLabel,
        unreadThreadCount: unreadCandidates.length,
        unreadSignals: unreadCandidates.reduce<Record<string, number>>((counts, candidate) => {
          counts[candidate.signal] = (counts[candidate.signal] ?? 0) + 1;
          return counts;
        }, {}),
        queuedJobs
      }
    };
  }

  if (job.kind === "process-thread") {
    const snapshot = adapter.read();
    return {
      completed: state.state === "conversation" && Boolean(snapshot),
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
