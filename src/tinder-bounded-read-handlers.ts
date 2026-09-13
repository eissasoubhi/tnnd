import { TinderDomAdapter } from "./tinder-adapter";
import { buildNormalizedMessageKeys } from "./tinder-message-key";
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
    if (!snapshot) {
      return {
        completed: false,
        kind: job.kind,
        observation: { hasConversationContext: false }
      };
    }

    const threadKeyHash = adapter.diagnose().threadKeyHash;
    const normalizedMessages = buildNormalizedMessageKeys(snapshot.context, threadKeyHash);
    const latestIncomingKey = normalizedMessages
      .filter((message) => message.direction === "them")
      .at(-1)?.key ?? snapshot.latestIncomingKey;

    return {
      completed: state.state === "conversation",
      kind: job.kind,
      observation: {
        threadKeyHash,
        latestIncomingKey,
        messageKeys: normalizedMessages.map((message) => message.key),
        hasConversationContext: Boolean(snapshot.context)
      }
    };
  }

  return {
    completed: false,
    kind: job.kind,
    observation: { reason: "swipe_requires_explicit_bounded_action_handler" }
  };
}
