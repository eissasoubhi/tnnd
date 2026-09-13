import { executeBoundedTinderRead, type TinderBoundedReadResult } from "./tinder-bounded-read-handlers";
import { executeTinderSingleTabStep, type TinderSingleTabExecutionResult } from "./tinder-single-tab-executor";
import type { TinderScheduledJob } from "./tinder-scheduler";
import type { TinderUiStateSnapshot } from "./tinder-state-machine";
import { completeUnreadCycleThread, reconcileUnreadCycle } from "./tinder-unread-cycle";
import { TinderDomAdapter } from "./tinder-adapter";

export interface TinderUnreadExecutorHooks {
  navigate(path: string): void | Promise<void>;
}

export interface TinderUnreadExecutorResult {
  execution: TinderSingleTabExecutionResult;
  read: TinderBoundedReadResult | null;
  discoveredJobs: TinderScheduledJob[];
  unreadCompletionPersisted: boolean;
}

export async function executeUnreadAwareTinderStep(
  state: TinderUiStateSnapshot,
  job: TinderScheduledJob,
  adapter: TinderDomAdapter,
  hooks: TinderUnreadExecutorHooks,
  existingJobs: readonly TinderScheduledJob[] = [],
  now = new Date().toISOString()
): Promise<TinderUnreadExecutorResult> {
  const cycle = job.kind === "scan-inbox" && state.state === "inbox"
    ? await reconcileUnreadCycle(document, existingJobs, now)
    : null;
  let read: TinderBoundedReadResult | null = null;

  const execution = await executeTinderSingleTabStep(state, job, {
    navigate: hooks.navigate,
    execute: (scheduledJob, currentState) => {
      read = executeBoundedTinderRead(adapter, scheduledJob, currentState);
      return read.completed;
    }
  }, now);

  let unreadCompletionPersisted = false;
  if (execution.completed && job.kind === "process-thread" && job.conversationRef) {
    unreadCompletionPersisted = Boolean(await completeUnreadCycleThread(job.conversationRef, now));
  }

  return {
    execution,
    read,
    discoveredJobs: cycle?.jobs ?? [],
    unreadCompletionPersisted
  };
}
