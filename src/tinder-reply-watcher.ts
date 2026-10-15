import { shouldKeepConversationInFocus, type ConversationActivity } from "./tinder-conversation-activity.ts";
import type { ExistingThreadIndex } from "./tinder-existing-thread-index";

/** Watch mode only responds to positive evidence, never a broad sweep.
 * Incoming from the saved backend is trustworthy only until that exact
 * version has been checked. Unread DOM hints can override stale backend
 * outgoing state. The actual opened chat is revalidated before any send.
 */
export function nextWatchedReply(state: ExistingThreadIndex): string | null {
  const pending = state.threads.filter(entry =>
    entry.queuedAt !== null
    && (entry.unreadAt !== null || (
      entry.lastMessageDirection === "incoming" &&
      entry.serverMessageAt !== null &&
      entry.checkedMessageAt !== entry.serverMessageAt
    ))
  );
  pending.sort((a,b) =>
    Number(b.unreadAt !== null) - Number(a.unreadAt !== null)
    || (a.queuedAt ?? "").localeCompare(b.queuedAt ?? "")
    || a.ref.localeCompare(b.ref)
  );
  return pending[0]?.ref ?? null;
}

export function pendingWatchedReplies(state: ExistingThreadIndex): number {
  return state.threads.filter(entry =>
    entry.queuedAt !== null && (
      entry.unreadAt !== null || (
        entry.lastMessageDirection === "incoming" && entry.serverMessageAt !== null
        && entry.serverMessageAt !== entry.checkedMessageAt
      )
    )).length;
}

export type WatcherDisplayStatus = "stopped" | "waiting" | "new-replies"
  | "following" | "processing" | "paused" | "disconnected";
export function watcherDisplayStatus(state: {
  enabled: boolean;
  pausedOnStop: boolean;
  phase: string;
  phaseDetail: string;
  pendingReplies: number;
  activeConversationRef?: string | null;
  activeConversationUntil?: string | null;
  lastRef?: string | null;
  conversationActivities?: ConversationActivity[];
}): WatcherDisplayStatus {
  if (state.phase === "error" && /receiver|missing|disconnect|tab|navigate/i.test(state.phaseDetail)) return "disconnected";
  if (!state.enabled) return state.pausedOnStop ? "paused" : "stopped";
  if (state.phase === "error" || /tab.*disconnect|tab.*navigated|receiver.*missing/i.test(state.phaseDetail)) return "disconnected";
  if (["loading", "generating", "sending"].includes(state.phase)) return "processing";
  if (state.activeConversationRef && state.activeConversationUntil
    && Date.parse(state.activeConversationUntil) > Date.now()
    && (!state.conversationActivities || shouldKeepConversationInFocus({
      activeConversationRef: state.activeConversationRef,
      activeConversationUntil: state.activeConversationUntil,
      conversationActivities: state.conversationActivities
    }, state.lastRef ?? null, [state.activeConversationRef]))) return "following";
  return state.pendingReplies > 0 ? "new-replies" : "waiting";
}

// Remember which unread badges are still visible: a lingering badge must not
// generate another event on every 30-second watcher snapshot.
export function newlyVisibleUnread(previous: readonly string[], current: readonly string[]): string[] {
  const old = new Set(previous);
  return [...new Set(current)].filter(ref => !old.has(ref));
}
