import { syncConversationDelta, type ConversationMessageDelta, type ConversationSyncResult } from "./conversation-sync";
import { resolveTinderBackendSyncDecision, type TinderBackendSyncDecision } from "./tinder-backend-management";
import { executeBoundedTinderRead, type TinderBoundedReadResult } from "./tinder-bounded-read-handlers";
import { loadTinderMessageCursor, saveTinderMessageCursor } from "./tinder-message-cursor-store";
import { planTinderMessageDelta } from "./tinder-message-delta";
import { executeTinderSingleTabStep, type TinderSingleTabExecutionResult } from "./tinder-single-tab-executor";
import type { TinderScheduledJob } from "./tinder-scheduler";
import type { TinderUiStateSnapshot } from "./tinder-state-machine";
import { completeUnreadCycleThread, reconcileUnreadCycle } from "./tinder-unread-cycle";
import { TinderDomAdapter } from "./tinder-adapter";

interface ObservedTinderMessage {
  key: string;
  direction: "me" | "them";
  text: string;
}

export interface TinderUnreadExecutorHooks {
  navigate(path: string): void | Promise<void>;
  loadMessageCursor?(conversationRef: string): Promise<string | null>;
  saveMessageCursor?(conversationRef: string, cursor: string): Promise<void>;
  resolveBackendSyncDecision?(
    conversationRef: string,
    read: TinderBoundedReadResult,
    persistedCursor: string | null
  ): Promise<TinderBackendSyncDecision>;
  syncConversationDelta?(
    conversationRef: string,
    messages: ConversationMessageDelta[],
    nextCursor: string
  ): Promise<ConversationSyncResult>;
}

export interface TinderMessageCursorUpdate {
  previousCursor: string | null;
  nextCursor: string;
  changed: boolean;
  persisted: boolean;
  deferredForBackendSync: boolean;
  cursorFound: boolean;
  deltaCount: number;
  truncated: boolean;
}

export interface TinderUnreadExecutorResult {
  execution: TinderSingleTabExecutionResult;
  read: TinderBoundedReadResult | null;
  discoveredJobs: TinderScheduledJob[];
  unreadCompletionPersisted: boolean;
  messageCursor: TinderMessageCursorUpdate | null;
  backendSyncDecision: TinderBackendSyncDecision | null;
  backendSyncSucceeded: boolean;
}

function observedIncomingCursor(read: TinderBoundedReadResult | null): string | null {
  const value = read?.observation.latestIncomingKey;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function observedMessages(read: TinderBoundedReadResult | null): ObservedTinderMessage[] {
  const value = read?.observation.messages;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim() : "";
    const text = typeof record.text === "string" ? record.text.slice(0, 4000) : "";
    const direction = record.direction === "me" || record.direction === "them" ? record.direction : null;
    return key && text && direction ? [{ key, text, direction }] : [];
  });
}

function observedMessageKeys(read: TinderBoundedReadResult | null): string[] {
  const messages = observedMessages(read);
  if (messages.length) return messages.map((message) => message.key);
  const value = read?.observation.messageKeys;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
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
  const loadCursor = hooks.loadMessageCursor ?? loadTinderMessageCursor;
  const saveCursor = hooks.saveMessageCursor ?? saveTinderMessageCursor;
  const resolveBackendDecision = hooks.resolveBackendSyncDecision ?? resolveTinderBackendSyncDecision;
  const syncDelta = hooks.syncConversationDelta
    ?? ((ref: string, messages: ConversationMessageDelta[], nextCursor: string) => syncConversationDelta(ref, messages, undefined, nextCursor));
  const previousCursor = conversationRef ? await loadCursor(conversationRef) : null;
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

  let backendSyncDecision: TinderBackendSyncDecision | null = null;
  if (execution.completed && conversationRef && read) {
    try {
      backendSyncDecision = await resolveBackendDecision(conversationRef, read, previousCursor);
    } catch (error) {
      console.debug("TNND backend takeover gate failed closed", error);
    }
  }

  let messageCursor: TinderMessageCursorUpdate | null = null;
  let backendSyncSucceeded = false;
  if (execution.completed && conversationRef) {
    const messages = observedMessages(read);
    const keys = messages.length ? messages.map((message) => message.key) : observedMessageKeys(read);
    const delta = planTinderMessageDelta(
      keys.map((key) => ({ key, value: messages.find((message) => message.key === key) ?? null })),
      previousCursor,
      { maxItems: 40 }
    );
    const nextCursor = delta.nextCursor ?? observedIncomingCursor(read);

    if (nextCursor) {
      const changed = previousCursor !== nextCursor;
      const deferredForBackendSync = changed && backendSyncDecision?.shouldSync === true;
      let persisted = false;

      if (changed && backendSyncDecision?.shouldSync === true && delta.items.length) {
        const syncMessages = delta.items.flatMap(({ value }) => {
          if (!value) return [];
          return [{
            externalMessageId: value.key,
            direction: value.direction === "them" ? "incoming" : "outgoing",
            text: value.text,
            sentAt: now
          } satisfies ConversationMessageDelta];
        });
        if (syncMessages.length) {
          try {
            const syncResult = await syncDelta(conversationRef, syncMessages, nextCursor);
            if (syncResult.nextCursor !== nextCursor) {
              throw new Error("TNND backend did not acknowledge the expected message cursor.");
            }
            await saveCursor(conversationRef, nextCursor);
            persisted = true;
            backendSyncSucceeded = true;
          } catch (error) {
            console.debug("TNND bounded Tinder delta sync failed; cursor retained", error);
          }
        }
      } else if (changed && backendSyncDecision && !backendSyncDecision.shouldSync) {
        await saveCursor(conversationRef, nextCursor);
        persisted = true;
      }

      messageCursor = {
        previousCursor,
        nextCursor,
        changed,
        persisted,
        deferredForBackendSync: deferredForBackendSync && !backendSyncSucceeded,
        cursorFound: delta.cursorFound,
        deltaCount: delta.items.length,
        truncated: delta.truncated
      };
    }
  }

  return {
    execution,
    read,
    discoveredJobs: cycle?.jobs ?? [],
    unreadCompletionPersisted,
    messageCursor,
    backendSyncDecision,
    backendSyncSucceeded
  };
}
