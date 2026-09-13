import { executeBoundedTinderRead, type TinderBoundedReadResult } from "./tinder-bounded-read-handlers";
import { executeTinderSingleTabStep, type TinderSingleTabExecutionResult } from "./tinder-single-tab-executor";
import type { TinderScheduledJob } from "./tinder-scheduler";
import type { TinderUiStateSnapshot } from "./tinder-state-machine";
import { completeUnreadCycleThread, reconcileUnreadCycle } from "./tinder-unread-cycle";
import { TinderDomAdapter } from "./tinder-adapter";

export interface TinderUnreadExecutorHooks {
  navigate(path: string): void | Promise<void>;
  loadMessageCursor?(conversationRef: string): Promise<string | null>;
  saveMessageCursor?(conversationRef: string, cursor: string): Promise<void>;
}

export interface TinderMessageCursorUpdate {
  previousCursor: string | null;
  nextCursor: string;
  changed: boolean;
  persisted: boolean;
}

export interface TinderUnreadExecutorResult {
  execution: TinderSingleTabExecutionResult;
  read: TinderBoundedReadResult | null;
  discoveredJobs: TinderScheduledJob[];
  unreadCompletionPersisted: boolean;
  messageCursor: TinderMessageCursorUpdate | null;
}

function observedIncomingCursor(read: TinderBoundedReadResult | null): string | null {
  const value = read?.observation.latestIncomingKey;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  const conversationRef = job.kind === "process-thread" ? job.conversationRef ?? null : null;
  const previousCursor = conversationRef && hooks.loadMessageCursor
    ? await hooks.loadMessageCursor(conversationRef)
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
  if (execution.completed && conversationRef) {
    unreadCompletionPersisted = Boolean(await completeUnreadCycleThread(conversationRef, now));
  }

  let messageCursor: TinderMessageCursorUpdate | null = null;
  const nextCursor = execution.completed ? observedIncomingCursor(read) : null;
  if (conversationRef && nextCursor) {
    const changed = previousCursor !== nextCursor;
    let persisted = false;
    if (changed && hooks.saveMessageCursor) {
      await hooks.saveMessageCursor(conversationRef, nextCursor);
      persisted = true;
    }
    messageCursor = { previousCursor, nextCursor, changed, persisted };
  }

  return {
    execution,
    read,
    discoveredJobs: cycle?.jobs ?? [],
    unreadCompletionPersisted,
    messageCursor
  };
}
