import type { TinderScheduledJob } from "./tinder-scheduler";
import {
  markUnreadObservationCompleted,
  reconcileUnreadObservations,
  type TinderUnreadObservationState
} from "./tinder-unread-observation-state";
import { loadUnreadObservationState, saveUnreadObservationState } from "./tinder-unread-observation-store";
import {
  buildUnreadProcessThreadJobs,
  discoverUnreadThreadCandidates,
  type TinderUnreadThreadCandidate
} from "./tinder-unread-queue";

export interface TinderUnreadCycleResult {
  candidates: TinderUnreadThreadCandidate[];
  state: TinderUnreadObservationState;
  jobs: TinderScheduledJob[];
}

export async function reconcileUnreadCycle(
  root: ParentNode = document,
  existingJobs: readonly TinderScheduledJob[] = [],
  now = new Date().toISOString()
): Promise<TinderUnreadCycleResult> {
  const candidates = discoverUnreadThreadCandidates(root);
  const previous = await loadUnreadObservationState();
  const state = reconcileUnreadObservations(previous, candidates, now);
  const saved = await saveUnreadObservationState(state);
  const completedVisibleRefs = saved.entries
    .filter((entry) => entry.status === "completed-visible")
    .map((entry) => entry.conversationRef);

  return {
    candidates,
    state: saved,
    jobs: buildUnreadProcessThreadJobs(candidates, existingJobs, completedVisibleRefs)
  };
}

export async function completeUnreadCycleThread(
  conversationRef: string,
  now = new Date().toISOString()
): Promise<TinderUnreadObservationState | null> {
  const current = await loadUnreadObservationState();
  if (!current) return null;
  const next = markUnreadObservationCompleted(current, conversationRef, now);
  return saveUnreadObservationState(next);
}
